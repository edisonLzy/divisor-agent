import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { AgentRuntime } from './agent-runtime.js';
import type { BunToWebViewMessage } from '../shared/ipc-types.js';

const HOME_DIR = process.env.HOME ?? '/tmp';

let mainWindow: BrowserWindow | null = null;

const agentRuntime = new AgentRuntime(HOME_DIR);

agentRuntime.setWebViewSender((msg: BunToWebViewMessage) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(msg.event, msg.payload);
  }
});

function registerIpcHandlers(): void {
  ipcMain.handle('setModel', (_, params: { sessionId: string; provider: string; modelId: string }) =>
    agentRuntime.setModel(params.sessionId, params.provider, params.modelId),
  );

  ipcMain.handle('cycleModel', (_, params: { sessionId: string; direction?: 'next' | 'prev' }) =>
    agentRuntime.cycleModel(params.sessionId, params.direction),
  );

  ipcMain.handle('getAvailableModels', () =>
    agentRuntime.getAvailableModels(),
  );

  ipcMain.handle('sessionPrompt', (_, params) => {
    agentRuntime.prompt(params).catch((err: unknown) => {
      console.error('sessionPrompt error:', err);
    });
  });

  ipcMain.handle('permissionApprove', (_, params: { requestId: string }) => {
    agentRuntime.approvePermission(params.requestId);
  });

  ipcMain.handle('permissionReject', (_, params: { requestId: string }) => {
    agentRuntime.rejectPermission(params.requestId);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
    title: 'Divisor Agent',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await agentRuntime.initialize();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

console.log('Divisor Agent main process started!');
