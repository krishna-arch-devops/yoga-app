"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    getState: () => electron_1.ipcRenderer.invoke("app:get-state"),
    updateSettings: (settings) => electron_1.ipcRenderer.invoke("app:update-settings", settings),
    reminderAction: (action) => electron_1.ipcRenderer.invoke("reminder:action", action),
    openSettings: () => electron_1.ipcRenderer.invoke("window:open-settings"),
    closeReminder: () => electron_1.ipcRenderer.invoke("window:close-reminder"),
    onStateChanged: (callback) => {
        const listener = (_event, state) => callback(state);
        electron_1.ipcRenderer.on("state:changed", listener);
        return () => electron_1.ipcRenderer.removeListener("state:changed", listener);
    }
};
electron_1.contextBridge.exposeInMainWorld("spaceCares", api);
