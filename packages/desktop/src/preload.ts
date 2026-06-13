import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('frigg', {
  desktop: true,
  platform: process.platform,
});
