import { useSyncExternalStore } from "react";

/* Light / dark theme, remembered; first run follows the device setting. */
const KEY = "drishti_theme";
const listeners = new Set();
const initial = () => {
  try { const s = localStorage.getItem(KEY); if (s) return s; } catch { /* ignore */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};
let theme = "light";

export function applyTheme(t = initial()) {
  theme = t;
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", t === "dark" ? "#191919" : "#ffffff");
  listeners.forEach((f) => f());
}
export function toggleTheme() {
  const next = theme === "dark" ? "light" : "dark";
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  applyTheme(next);
}
export const useTheme = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => theme);
