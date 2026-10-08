import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  appVersion: process.env.npm_package_version,
});
