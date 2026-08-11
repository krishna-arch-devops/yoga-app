import { contextBridge, ipcRenderer } from "electron";
import type { AppState, ReminderAction, ReminderSettings } from "./types";

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke("app:get-state"),
  updateSettings: (settings: Partial<ReminderSettings>): Promise<AppState> =>
    ipcRenderer.invoke("app:update-settings", settings),
  reminderAction: (action: ReminderAction): Promise<AppState> =>
    ipcRenderer.invoke("reminder:action", action),
  openSettings: (): Promise<void> => ipcRenderer.invoke("window:open-settings"),
  closeReminder: (): Promise<AppState> => ipcRenderer.invoke("window:close-reminder"),
  onStateChanged: (callback: (state: AppState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  }
};

contextBridge.exposeInMainWorld("spaceCares", api);
