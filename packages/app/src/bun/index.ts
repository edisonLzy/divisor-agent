import { BrowserWindow, Updater, defineElectrobunRPC } from 'electrobun/bun';
import { AgentRuntime } from './agent-runtime.js';
import type { SessionPromptParams, BunToWebViewMessage } from '../shared/ipc-types.js';

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const HOME_DIR = process.env.HOME ?? '/tmp';

// Bun RPC handlers
const rpc = defineElectrobunRPC('bun', {
  handlers: {
    requests: {
      sessionPrompt: async (params: unknown) => {
        await agentRuntime.prompt(params as SessionPromptParams);
      },
      permissionApprove: async (params: unknown) => {
        const p = params as { requestId: string };
        agentRuntime.approvePermission(p.requestId);
      },
      permissionReject: async (params: unknown) => {
        const p = params as { requestId: string };
        agentRuntime.rejectPermission(p.requestId);
      },
    },
    messages: {
      '*': (name: string, payload: unknown) => {
        // Forward messages to webview
        (rpc.send as (name: string, payload: unknown) => void)(name, payload);
      },
    },
  },
});

// Initialize Agent Runtime
const agentRuntime = new AgentRuntime(HOME_DIR);

// Set up WebView sender
agentRuntime.setWebViewSender((msg: BunToWebViewMessage) => {
  const { event, payload } = msg;
  (rpc.send as (name: string, payload: unknown) => void)(event, payload);
});

await agentRuntime.initialize();

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === 'dev') {
    try {
      await fetch(DEV_SERVER_URL, { method: 'HEAD' });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        'Vite dev server not running. Run \'bun run dev:hmr\' for HMR support.',
      );
    }
  }
  return 'views://mainview/index.html';
}

const url = await getMainViewUrl();

new BrowserWindow({
  title: 'Divisor Agent',
  url,
  rpc,
  frame: {
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
  },
});

console.log('Divisor Agent started!');
