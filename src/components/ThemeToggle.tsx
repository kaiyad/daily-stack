"use client";

import { useSyncExternalStore } from "react";

const KEY = "daily-stack:theme";

type Theme = "light" | "dark";

/**
 * The theme lives in the DOM and in localStorage, not in React, so it is read
 * through useSyncExternalStore - the same treatment read state gets. The
 * server snapshot is null, which renders a toggle that claims nothing: the
 * stylesheet has already picked a side from `prefers-color-scheme` by then.
 */
const themeStore = {
  listeners: new Set<() => void>(),

  subscribe(listener: () => void): () => void {
    themeStore.listeners.add(listener);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", listener);
    return () => {
      themeStore.listeners.delete(listener);
      media.removeEventListener("change", listener);
    };
  },

  getSnapshot(): Theme {
    const set = document.documentElement.dataset.theme;
    if (set === "dark" || set === "light") return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  },

  getServerSnapshot(): Theme | null {
    return null;
  },

  set(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* blocked storage: the choice holds for this page and no longer */
    }
    for (const listener of themeStore.listeners) listener();
  },
};

/**
 * The stylesheet carries a full dark palette behind `prefers-color-scheme` and
 * a `[data-theme]` override. This is the override's only switch; without a
 * stored choice the system preference still wins.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );
  const dark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => themeStore.set(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
      title={dark ? "Light" : "Dark"}
    >
      {dark ? "☀" : "☾"}
    </button>
  );
}
