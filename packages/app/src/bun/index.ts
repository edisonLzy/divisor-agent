import { BrowserWindow, Updater } from 'electrobun/bun';

const DEV_SERVER_PORT = 1420;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();

  if (channel === 'dev') {
    try {
      await fetch(DEV_SERVER_URL, { method: 'HEAD' });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log('Vite dev server not running. Run \'bun run dev:hmr\' for HMR support.');
    }
  }

  return 'views://mainview/index.html';
}

const url = await getMainViewUrl();
const window = new BrowserWindow({
  title: 'divisor-agent',
  url,
  frame: {
    width: 1280,
    height: 840,
    x: 200,
    y: 120,
  },
});

void window;
console.log('divisor-agent app started.');
