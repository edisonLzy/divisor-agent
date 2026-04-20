import { describe, it, expect, beforeEach } from 'vitest';
import { Type } from '@sinclair/typebox';
import { pluginRegistry } from '../../src/plugins/registry.js';
import type {
  PluginContext,
  PluginToolDefinition,
} from '../../src/plugins/types.js';

const CTX: PluginContext = { sessionId: 'test-session' };

describe('PluginRegistry', () => {
  beforeEach(() => {
    pluginRegistry.reset();
  });

  // ── Tool registration ───────────────────────────────────────────────────

  describe('registerTool / getTools', () => {
    it('stores registered tools', () => {
      const def: PluginToolDefinition = {
        name: 'my_tool',
        label: 'My Tool',
        description: 'A test tool',
        parameters: Type.Object({ text: Type.String() }),
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      };

      pluginRegistry.registerTool(def);
      expect(pluginRegistry.getTools()).toHaveLength(1);
      expect(pluginRegistry.getTools()[0].name).toBe('my_tool');
    });

    it('returns a copy so callers cannot mutate internal state', () => {
      pluginRegistry.registerTool({
        name: 'tool_a',
        label: 'Tool A',
        description: 'desc',
        parameters: Type.Object({}),
        execute: async () => ({ content: [] }),
      });

      const tools = pluginRegistry.getTools();
      tools.push({
        name: 'injected',
        label: 'Injected',
        description: 'injected',
        parameters: Type.Object({}),
        execute: async () => ({ content: [] }),
      });

      expect(pluginRegistry.getTools()).toHaveLength(1);
    });
  });

  // ── session_start ───────────────────────────────────────────────────────

  describe('emitSessionStart', () => {
    it('calls registered handler', async () => {
      const calls: string[] = [];
      pluginRegistry.on('session_start', (event) => { calls.push(event.sessionId); });

      await pluginRegistry.emitSessionStart('s1', CTX);
      expect(calls).toEqual(['s1']);
    });

    it('calls multiple handlers in order', async () => {
      const order: number[] = [];
      pluginRegistry.on('session_start', () => { order.push(1); });
      pluginRegistry.on('session_start', () => { order.push(2); });

      await pluginRegistry.emitSessionStart('s1', CTX);
      expect(order).toEqual([1, 2]);
    });

    it('continues after a handler throws', async () => {
      const calls: number[] = [];
      pluginRegistry.on('session_start', () => { throw new Error('boom'); });
      pluginRegistry.on('session_start', () => { calls.push(1); });

      await expect(pluginRegistry.emitSessionStart('s1', CTX)).resolves.toBeUndefined();
      expect(calls).toEqual([1]);
    });
  });

  // ── before_agent_start ──────────────────────────────────────────────────

  describe('emitBeforeAgentStart', () => {
    it('returns original systemPrompt when no handlers', async () => {
      const result = await pluginRegistry.emitBeforeAgentStart('s1', 'hello', 'original prompt', CTX);
      expect(result.systemPrompt).toBe('original prompt');
    });

    it('uses modified systemPrompt returned by a handler', async () => {
      pluginRegistry.on('before_agent_start', (event) => ({
        systemPrompt: event.systemPrompt + ' [modified]',
      }));

      const result = await pluginRegistry.emitBeforeAgentStart('s1', 'hello', 'base', CTX);
      expect(result.systemPrompt).toBe('base [modified]');
    });

    it('chains systemPrompt modifications across handlers', async () => {
      pluginRegistry.on('before_agent_start', (event) => ({
        systemPrompt: event.systemPrompt + ' [A]',
      }));
      pluginRegistry.on('before_agent_start', (event) => ({
        systemPrompt: event.systemPrompt + ' [B]',
      }));

      const result = await pluginRegistry.emitBeforeAgentStart('s1', 'hello', 'base', CTX);
      expect(result.systemPrompt).toBe('base [A] [B]');
    });

    it('skips handler error and continues chaining', async () => {
      pluginRegistry.on('before_agent_start', () => { throw new Error('bad'); });
      pluginRegistry.on('before_agent_start', (event) => ({
        systemPrompt: event.systemPrompt + ' [ok]',
      }));

      const result = await pluginRegistry.emitBeforeAgentStart('s1', 'hello', 'base', CTX);
      expect(result.systemPrompt).toBe('base [ok]');
    });
  });

  // ── tool_call ───────────────────────────────────────────────────────────

  describe('emitToolCall', () => {
    it('returns undefined when no handler blocks', async () => {
      const result = await pluginRegistry.emitToolCall('s1', 'bash', 'tc1', {}, CTX);
      expect(result).toBeUndefined();
    });

    it('returns block result when a handler blocks', async () => {
      pluginRegistry.on('tool_call', (event) => {
        if (event.toolName === 'dangerous') {
          return { block: true as const, reason: 'not allowed' };
        }
      });

      const result = await pluginRegistry.emitToolCall('s1', 'dangerous', 'tc1', {}, CTX);
      expect(result).toEqual({ block: true, reason: 'not allowed' });
    });

    it('stops after first block and does not call remaining handlers', async () => {
      const calls: number[] = [];
      pluginRegistry.on('tool_call', () => {
        calls.push(1);
        return { block: true as const };
      });
      pluginRegistry.on('tool_call', () => { calls.push(2); });

      await pluginRegistry.emitToolCall('s1', 'bash', 'tc1', {}, CTX);
      expect(calls).toEqual([1]);
    });

    it('continues after a handler throws', async () => {
      pluginRegistry.on('tool_call', () => { throw new Error('oops'); });

      await expect(
        pluginRegistry.emitToolCall('s1', 'bash', 'tc1', {}, CTX),
      ).resolves.toBeUndefined();
    });
  });

  // ── tool_result ─────────────────────────────────────────────────────────

  describe('emitToolResult', () => {
    const originalContent = [{ type: 'text', text: 'result' }];

    it('returns original values when no handlers', async () => {
      const patch = await pluginRegistry.emitToolResult(
        's1', 'bash', 'tc1', {}, originalContent, false, CTX,
      );
      expect(patch.content).toBe(originalContent);
      expect(patch.isError).toBe(false);
    });

    it('allows a handler to modify content', async () => {
      pluginRegistry.on('tool_result', () => ({
        content: [{ type: 'text', text: 'modified' }],
      }));

      const patch = await pluginRegistry.emitToolResult(
        's1', 'bash', 'tc1', {}, originalContent, false, CTX,
      );
      expect(patch.content).toEqual([{ type: 'text', text: 'modified' }]);
    });

    it('allows a handler to flip isError', async () => {
      pluginRegistry.on('tool_result', () => ({ isError: true }));

      const patch = await pluginRegistry.emitToolResult(
        's1', 'bash', 'tc1', {}, originalContent, false, CTX,
      );
      expect(patch.isError).toBe(true);
    });

    it('chains modifications across handlers', async () => {
      pluginRegistry.on('tool_result', () => ({
        content: [{ type: 'text', text: 'step1' }],
      }));
      pluginRegistry.on('tool_result', (event) => ({
        content: [{ type: 'text', text: event.content[0].text + '-step2' }],
      }));

      const patch = await pluginRegistry.emitToolResult(
        's1', 'bash', 'tc1', {}, originalContent, false, CTX,
      );
      expect(patch.content).toEqual([{ type: 'text', text: 'step1-step2' }]);
    });

    it('continues after a handler throws', async () => {
      pluginRegistry.on('tool_result', () => { throw new Error('fail'); });

      await expect(
        pluginRegistry.emitToolResult('s1', 'bash', 'tc1', {}, originalContent, false, CTX),
      ).resolves.toBeDefined();
    });
  });

  // ── reset ────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all handlers and tools', async () => {
      pluginRegistry.on('session_start', () => {});
      pluginRegistry.registerTool({
        name: 'x',
        label: 'X',
        description: 'x',
        parameters: Type.Object({}),
        execute: async () => ({ content: [] }),
      });

      pluginRegistry.reset();

      const calls: string[] = [];
      pluginRegistry.on('session_start', (e) => calls.push(e.sessionId));
      // The old handler must not fire
      await pluginRegistry.emitSessionStart('s1', CTX);
      // The new handler fires
      expect(calls).toEqual(['s1']);

      expect(pluginRegistry.getTools()).toHaveLength(0);
    });
  });
});
