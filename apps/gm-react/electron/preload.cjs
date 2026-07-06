// @ts-check
'use strict';

// Preload bridge for the DND Tools GM desktop shell.
//
// Intentionally empty. The renderer is a self-contained offline app (IndexedDB persistence, no native
// filesystem/dialog/update needs for the alpha), so there is nothing to expose across the context
// bridge yet. This file exists so `contextIsolation: true` has a preload to load and so a future IPC
// surface (see packages/core/src/contracts/desktop-shell.contract.ts) has an obvious home:
//
//   const { contextBridge, ipcRenderer } = require('electron');
//   contextBridge.exposeInMainWorld('desktop', { ... });
