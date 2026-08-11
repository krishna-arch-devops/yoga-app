export type ReminderAction = "done" | "snooze" | "skip";

export interface ReminderSettings {
  intervalMinutes: number;
  isPaused: boolean;
}

export interface ReminderStats {
  completedCount: number;
  skippedCount: number;
  snoozedCount: number;
  lastReminderTime: string | null;
  activityDate: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  instruction: string;
  durationSeconds: number;
  gifPath: string;
}

export interface AppState {
  settings: ReminderSettings;
  stats: ReminderStats;
  currentExercise: Exercise;
}
