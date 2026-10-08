const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

const electronCode = `const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const indexPath = isDev
    ? 'http://localhost:5173'
    : \`file://\${path.join(__dirname, 'index.html')}\`;

  mainWindow.loadURL(indexPath);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Exit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          app.quit();
        },
      },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
      { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
      { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);`;

const preloadCode = `const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  appVersion: process.env.npm_package_version,
});`;

const electronPath = path.join(rootDir, 'electron.cjs');
const preloadPath = path.join(rootDir, 'preload.cjs');

fs.writeFileSync(electronPath, electronCode);
fs.writeFileSync(preloadPath, preloadCode);

console.log('✓ Electron main files created at root');
console.log(`  - ${electronPath}`);
console.log(`  - ${preloadPath}`);
