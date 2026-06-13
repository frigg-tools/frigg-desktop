import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';

const isDev = process.env.FRIGG_DESKTOP_DEV === '1';
const DEV_URL = 'http://localhost:5173';

let mainWindow: BrowserWindow | null = null;
let stopServer: (() => Promise<void>) | null = null;

async function resolveAppUrl(): Promise<string> {
  if (isDev) {
    const waitOn = (await import('wait-on')).default;
    await waitOn({ resources: [DEV_URL], timeout: 60_000, tcpTimeout: 1_000 });
    return DEV_URL;
  }
  const { startFrigg } = await import('@frigg/server');
  const frigg = await startFrigg({ webDir: path.join(process.resourcesPath, 'web') });
  stopServer = frigg.stop;
  return frigg.uiUrl;
}

function createWindow(url: string): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#09090b',
    title: 'Frigg',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(url);
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

void app.whenReady().then(async () => {
  buildMenu();
  const url = await resolveAppUrl();
  createWindow(url);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (stopServer) void stopServer();
});
