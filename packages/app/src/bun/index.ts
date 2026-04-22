import { BrowserView, BrowserWindow, Updater } from 'electrobun/bun';
import { AgentRuntime } from './agent-runtime.js';
import type { BunToWebViewMessage, RPCType } from '../shared/ipc-types.js';

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const HOME_DIR = process.env.HOME ?? '/tmp';

// Bun RPC handlers
const rpc = BrowserView.defineRPC<RPCType>({
  handlers: {
    requests: {
      setModel: async (params) => {
        const { sessionId, provider, modelId } = params;
        agentRuntime.setModel(sessionId, provider, modelId);
      },
      cycleModel(params) {
        agentRuntime.cycleModel(params.sessionId, params.direction);
      },
      getAvailableModels() {
        return agentRuntime.getAvailableModels();
      },
    },
    messages: {},
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
