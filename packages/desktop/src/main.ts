import { app, BrowserWindow, Menu, dialog, shell, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';

const isDev = process.env.FRIGG_DESKTOP_DEV === '1';
const DEV_URL = 'http://localhost:5173';

let mainWindow: BrowserWindow | null = null;
let stopServer: (() => Promise<void>) | null = null;
let isQuitting = false;

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

async function bootstrap(): Promise<void> {
  buildMenu();
  try {
    const url = await resolveAppUrl();
    createWindow(url);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
    });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    const message =
      err.code === 'EADDRINUSE'
        ? 'Frigg is already running (its ports are in use). Quit the other Frigg or CLI instance and try again.'
        : `Frigg failed to start: ${err.message ?? String(error)}`;
    dialog.showErrorBox('Frigg could not start', message);
    app.quit();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  void app.whenReady().then(bootstrap);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (isQuitting || !stopServer) return;
  isQuitting = true;
  event.preventDefault();
  void stopServer()
    .catch((error) => console.error('Frigg shutdown error:', error))
    .finally(() => app.exit(0));
});
