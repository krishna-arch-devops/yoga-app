import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Clock, Coffee, Pause, Play, RotateCcw, Settings, SkipForward, Sparkles, Timer, X } from "lucide-react";
import { exercises } from "./exercises";
import type { AppState, ReminderAction } from "./types";
import "./styles.css";

const intervalOptions = [10, 15, 20, 30, 45, 60];

function localTodayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const fallbackState: AppState = {
  settings: { intervalMinutes: 20, isPaused: false },
  stats: { completedCount: 0, skippedCount: 0, snoozedCount: 0, lastReminderTime: null, activityDate: localTodayKey() },
  currentExercise: {
    id: "stand-up-stretch",
    name: "Stand up stretch",
    category: "Full body",
    instruction: "Stand tall, reach both arms overhead, and lengthen your spine.",
    durationSeconds: 60,
    gifPath: "gifs/stand-up-stretch.gif"
  }
};

function useSpaceCaresState() {
  const [state, setState] = useState<AppState>(fallbackState);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    window.spaceCares.getState().then((nextState) => {
      setState(nextState);
      setIsReady(true);
    });

    return window.spaceCares.onStateChanged(setState);
  }, []);

  return { state, isReady, setState };
}

function App() {
  const route = window.location.hash.includes("reminder") ? "reminder" : "settings";
  const { state, isReady, setState } = useSpaceCaresState();

  if (!isReady) {
    return <div className="loading">#SpaceCares</div>;
  }

  return route === "reminder" ? (
    <ReminderPopup state={state} setState={setState} />
  ) : (
    <SettingsScreen state={state} setState={setState} />
  );
}

function SettingsScreen({
  state,
  setState
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}) {
  const isCustom = !intervalOptions.includes(state.settings.intervalMinutes);
  const [customMinutes, setCustomMinutes] = useState(isCustom ? String(state.settings.intervalMinutes) : "");

  const lastReminder = useMemo(() => {
    if (!state.stats.lastReminderTime) {
      return "Not yet";
    }

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(state.stats.lastReminderTime));
  }, [state.stats.lastReminderTime]);

  async function updateInterval(minutes: number) {
    const nextState = await window.spaceCares.updateSettings({ intervalMinutes: minutes });
    setState(nextState);
  }

  async function togglePaused() {
    const nextState = await window.spaceCares.updateSettings({ isPaused: !state.settings.isPaused });
    setState(nextState);
  }

  async function applyCustom() {
    const minutes = Number(customMinutes);
    if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 480) {
      await updateInterval(Math.round(minutes));
    }
  }

  return (
    <main className="settings-shell">
      <section className="topbar">
        <div>
          <div className="brand-row">
            <Sparkles size={22} aria-hidden />
            <span>#SpaceCares</span>
          </div>
          <h1>Your 60-second wellness break, tuned for the workday.</h1>
        </div>
        <button className={state.settings.isPaused ? "primary-action resume" : "primary-action"} onClick={togglePaused}>
          {state.settings.isPaused ? <Play size={18} /> : <Pause size={18} />}
          {state.settings.isPaused ? "Resume" : "Pause"}
        </button>
      </section>

      <section className="dashboard-grid">
        <div className="panel reminder-panel">
          <div className="panel-heading">
            <Settings size={20} aria-hidden />
            <div>
              <h2>Reminder Interval</h2>
              <p>Current selected interval: {state.settings.intervalMinutes} minutes</p>
            </div>
          </div>
          <div className="interval-grid">
            {intervalOptions.map((minutes) => (
              <button
                className={state.settings.intervalMinutes === minutes ? "interval-option selected" : "interval-option"}
                key={minutes}
                onClick={() => updateInterval(minutes)}
              >
                <span>{minutes}</span>
                <small>min</small>
              </button>
            ))}
          </div>
          <div className={isCustom ? "custom-row active" : "custom-row"}>
            <label htmlFor="custom-minutes">Custom minutes</label>
            <div>
              <input
                id="custom-minutes"
                min={1}
                max={480}
                type="number"
                value={customMinutes}
                placeholder="25"
                onChange={(event) => setCustomMinutes(event.target.value)}
              />
              <button onClick={applyCustom}>Set</button>
            </div>
          </div>
        </div>

        <div className="panel status-panel">
          <div className="panel-heading">
            <Clock size={20} aria-hidden />
            <div>
              <h2>Today's Activity</h2>
              <p>Simple progress for today</p>
            </div>
          </div>
          <div className="status-card">
            <span className={state.settings.isPaused ? "status-dot paused" : "status-dot"} />
            <div>
              <strong>{state.settings.isPaused ? "Paused" : "Running"}</strong>
              <p>Every {state.settings.intervalMinutes} minutes</p>
            </div>
          </div>
          <dl className="stats-grid">
            <div>
              <dt>Completed</dt>
              <dd>{state.stats.completedCount}</dd>
            </div>
            <div>
              <dt>Snoozed</dt>
              <dd>{state.stats.snoozedCount}</dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd>{state.stats.skippedCount}</dd>
            </div>
          </dl>
          <p className="last-reminder">Last reminder: {lastReminder}</p>
        </div>
      </section>

      <section className="exercise-strip" aria-label="Exercise library">
        {exercises.map((exercise) => (
          <span key={exercise.id}>{exercise.name}</span>
        ))}
      </section>
    </main>
  );
}

function ReminderPopup({
  state,
  setState
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}) {
  const [secondsLeft, setSecondsLeft] = useState(state.currentExercise.durationSeconds);
  const progress = Math.max(0, Math.min(1, secondsLeft / state.currentExercise.durationSeconds));
  const progressDegrees = Math.round(progress * 360);

  useEffect(() => {
    setSecondsLeft(state.currentExercise.durationSeconds);
  }, [state.currentExercise.durationSeconds, state.currentExercise.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [state.currentExercise.id]);

  async function act(action: ReminderAction) {
    const nextState = await window.spaceCares.reminderAction(action);
    setState(nextState);
  }

  return (
    <main className="popup-shell">
      <button className="window-close" onClick={() => window.spaceCares.closeReminder()} aria-label="Close reminder">
        <X size={16} />
      </button>
      <header className="popup-header">
        <div>
          <div className="popup-brand">#SpaceCares</div>
          <p>Your 60-second wellness break</p>
        </div>
        <div className="countdown-ring" style={{ "--progress": `${progressDegrees}deg` } as React.CSSProperties}>
          <Timer size={16} aria-hidden />
          <span>{secondsLeft}</span>
        </div>
      </header>
      <ExerciseGif exercise={state.currentExercise} />
      <section className="exercise-copy">
        <p className="duration">
          {state.currentExercise.category} · {state.currentExercise.durationSeconds} seconds
        </p>
        <h1>{state.currentExercise.name}</h1>
        <p>{state.currentExercise.instruction}</p>
      </section>
      <div className="popup-actions">
        <button className="done" onClick={() => act("done")}>
          <Check size={17} />
          Done
        </button>
        <button onClick={() => act("snooze")}>
          <Coffee size={17} />
          Snooze 5
        </button>
        <button onClick={() => act("skip")}>
          <SkipForward size={17} />
          Skip
        </button>
      </div>
    </main>
  );
}

function ExerciseGif({ exercise }: { exercise: AppState["currentExercise"] }) {
  const [hasGifError, setHasGifError] = useState(false);

  useEffect(() => {
    setHasGifError(false);
  }, [exercise.id, exercise.gifPath]);

  if (!hasGifError) {
    return (
      <div className="exercise-gif-media">
        <img
          alt={`${exercise.name} animated exercise guide`}
          src={exercise.gifPath}
          onError={() => setHasGifError(true)}
        />
      </div>
    );
  }

  return (
    <div className="exercise-gif fallback-card" role="img" aria-label={`${exercise.name} fallback exercise guide`}>
      <div className="fallback-label">GIF coming soon</div>
      <div className="sun" />
      <div className="mat" />
      <div className="person">
        <span className="head" />
        <span className="body" />
        <span className="arm left" />
        <span className="arm right" />
        <span className="leg left" />
        <span className="leg right" />
      </div>
      <RotateCcw className="loop-mark" size={18} aria-hidden />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
