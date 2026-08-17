import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import path from "node:path";
import fs from "node:fs";
import { exercises } from "../src/exercises";
import type { AppState, ReminderAction, ReminderSettings, ReminderStats } from "./types";

const isDev = !app.isPackaged;
const settingsFileName = "spacecares-state.json";
const defaultSettings: ReminderSettings = { intervalMinutes: 20, isPaused: false };
const defaultStats: ReminderStats = {
  completedCount: 0,
  skippedCount: 0,
  snoozedCount: 0,
  lastReminderTime: null,
  activityDate: todayKey()
};

let settingsWindow: BrowserWindow | null = null;
let reminderWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let reminderTimer: NodeJS.Timeout | null = null;
let reminderCloseReason: "action" | "dismiss" | null = null;
let state: AppState = {
  settings: defaultSettings,
  stats: defaultStats,
  currentExercise: exercises[0]
};

function statePath() {
  return path.join(app.getPath("userData"), settingsFileName);
}

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function resetDailyStatsIfNeeded() {
  if (state.stats.activityDate === todayKey()) {
    return;
  }

  state.stats = {
    completedCount: 0,
    skippedCount: 0,
    snoozedCount: 0,
    lastReminderTime: state.stats.lastReminderTime,
    activityDate: todayKey()
  };
  saveState();
}

function loadState() {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppState>;
    state = {
      settings: { ...defaultSettings, ...parsed.settings },
      stats: { ...defaultStats, ...parsed.stats },
      currentExercise: exercises.find((exercise) => exercise.id === parsed.currentExercise?.id) ?? exercises[0]
    };
    resetDailyStatsIfNeeded();
  } catch {
    saveState();
  }
}

function saveState() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

function rendererDevUrl(route: "settings" | "reminder") {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  return `${devServerUrl}#/${route}`;
}

function rendererHtmlPath() {
  return path.join(__dirname, "../../dist/index.html");
}

function configureRendererDiagnostics(window: BrowserWindow) {
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("Renderer failed to load:", {
      errorCode,
      errorDescription,
      validatedURL
    });
  });

}

function loadRenderer(window: BrowserWindow, route: "settings" | "reminder") {
  configureRendererDiagnostics(window);

  if (isDev) {
    return window.loadURL(rendererDevUrl(route));
  }

  return window.loadFile(rendererHtmlPath(), { hash: `/${route}` });
}

function broadcastState() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("state:changed", state);
  }
}

function chooseNextExercise() {
  const currentIndex = exercises.findIndex((exercise) => exercise.id === state.currentExercise.id);
  state.currentExercise = exercises[(currentIndex + 1) % exercises.length];
}

function clearReminderTimer() {
  if (reminderTimer) {
    clearTimeout(reminderTimer);
    reminderTimer = null;
  }
}

function hasActiveReminderWindow() {
  return reminderWindow !== null && !reminderWindow.isDestroyed();
}

function scheduleReminder(delayMinutes = state.settings.intervalMinutes) {
  #clearReminderTimer();
  if (state.settings.isPaused) {
    return;
  }

  const safeDelayMinutes = Math.max(1, delayMinutes);
  reminderTimer = setTimeout(() => {
    reminderTimer = null;
    showReminderWindow();
  }, safeDelayMinutes * 60 * 1000);
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 760,
    minHeight: 560,
    title: "#SpaceCares Settings",
    backgroundColor: "#f7f5ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadRenderer(settingsWindow, "settings");
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function reminderBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height, x, y } = display.workArea;
  const windowWidth = 400;
  const windowHeight = 560;
  const margin = 20;

  return {
    width: windowWidth,
    height: windowHeight,
    x: x + width - windowWidth - margin,
    y: y + height - windowHeight - margin
  };
}

function showReminderWindow() {
  clearReminderTimer();

  if (state.settings.isPaused) {
    return;
  }

  if (hasActiveReminderWindow()) {
    reminderWindow?.showInactive();
    reminderWindow?.setAlwaysOnTop(true, "floating");
    return;
  }

  resetDailyStatsIfNeeded();
  chooseNextExercise();
  state.stats.lastReminderTime = new Date().toISOString();
  saveState();

  reminderWindow = new BrowserWindow({
    ...reminderBounds(),
    title: "#SpaceCares",
    minWidth: 400,
    minHeight: 560,
    maxWidth: 400,
    maxHeight: 560,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    show: false,
    backgroundColor: "#f8f4ea",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  loadRenderer(reminderWindow, "reminder");
  reminderWindow.once("ready-to-show", () => {
    if (!reminderWindow) {
      return;
    }

    const margin = 20;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const workArea = display.workArea;
    const { width, height } = reminderWindow.getBounds();
    const popupX = workArea.x + workArea.width - width - margin;
    const popupY = workArea.y + workArea.height - height - margin;

    reminderWindow.setPosition(popupX, popupY, false);
    reminderWindow.showInactive();
    reminderWindow.setAlwaysOnTop(true, "floating");
    broadcastState();
  });
  reminderWindow.on("closed", () => {
    reminderWindow = null;
    if (reminderCloseReason === "dismiss") {
      scheduleReminder();
    }
    reminderCloseReason = null;
  });
}

function createTray() {
  const iconSvg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#214f4b"/>
      <path d="M16 7c2.5 4.5 6 6.8 10 7-2.8 1.9-6.1 2.3-10 1.1-3.9 1.2-7.2.8-10-1.1 4-.2 7.5-2.5 10-7Z" fill="#f6d36b"/>
      <path d="M10 22c4-1.7 8-1.7 12 0" fill="none" stroke="#fff7e1" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `);
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${iconSvg}`);
  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip("#SpaceCares");
  refreshTrayMenu();
}

function refreshTrayMenu() {
  const menu = Menu.buildFromTemplate([
    { label: "Open Settings", click: createSettingsWindow },
    { type: "separator" },
    {
      label: "Pause Reminders",
      enabled: !state.settings.isPaused,
      click: () => updateSettings({ isPaused: true })
    },
    {
      label: "Resume Reminders",
      enabled: state.settings.isPaused,
      click: () => updateSettings({ isPaused: false })
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]);
  tray?.setContextMenu(menu);
}

function updateSettings(nextSettings: Partial<ReminderSettings>) {
  state.settings = { ...state.settings, ...nextSettings };
  saveState();
  if (state.settings.isPaused) {
    clearReminderTimer();
    if (hasActiveReminderWindow()) {
      reminderCloseReason = null;
      reminderWindow?.close();
    }
  } else if (!hasActiveReminderWindow()) {
    scheduleReminder();
  }
  refreshTrayMenu();
  broadcastState();
  return state;
}

function closeReminderAsDismissal() {
  if (hasActiveReminderWindow()) {
    reminderCloseReason = "dismiss";
    reminderWindow?.close();
  } else {
    scheduleReminder();
  }

  return state;
}

async function handleReminderAction(action: ReminderAction) {
  resetDailyStatsIfNeeded();
  let nextDelayMinutes = state.settings.intervalMinutes;

  if (action === "done") {
    state.stats.completedCount += 1;
  }

  if (action === "snooze") {
    state.stats.snoozedCount += 1;
    nextDelayMinutes = 5;
  }

  if (action === "skip") {
    state.stats.skippedCount += 1;
  }

  saveState();
  reminderCloseReason = "action";
  reminderWindow?.close();
  scheduleReminder(nextDelayMinutes);
  broadcastState();
  return state;
}

app.whenReady().then(() => {
  loadState();
  ipcMain.handle("app:get-state", () => state);
  ipcMain.handle("app:update-settings", (_event, nextSettings: Partial<ReminderSettings>) => updateSettings(nextSettings));
  ipcMain.handle("reminder:action", (_event, action: ReminderAction) => handleReminderAction(action));
  ipcMain.handle("window:open-settings", () => createSettingsWindow());
  ipcMain.handle("window:close-reminder", () => closeReminderAsDismissal());

  createTray();
  createSettingsWindow();
  scheduleReminder();

  app.on("activate", () => createSettingsWindow());
});

app.on("window-all-closed", () => {
  // Keep the timer and tray alive after the settings window is closed.
});

app.on("before-quit", () => clearReminderTimer());
