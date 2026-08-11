import type { AppState, ReminderAction, ReminderSettings } from "./types";

declare global {
  interface Window {
    spaceCares: {
      getState: () => Promise<AppState>;
      updateSettings: (settings: Partial<ReminderSettings>) => Promise<AppState>;
      reminderAction: (action: ReminderAction) => Promise<AppState>;
      openSettings: () => Promise<void>;
      closeReminder: () => Promise<AppState>;
      onStateChanged: (callback: (state: AppState) => void) => () => void;
    };
  }
}

export {};
