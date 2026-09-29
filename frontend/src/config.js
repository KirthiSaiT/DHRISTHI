import { Capacitor } from "@capacitor/core";

/*
  Where the DRISHTI backend lives.
  - In a browser served by the dev machine, the same host on :8000 just works.
  - Inside the installed (native) app there is no "same host", so the driver /
    operator enters the server address once (Setup screen); it is remembered.
*/
const KEY = "drishti_server_url";
export const isNative = () => Capacitor.isNativePlatform();

export function getServerUrl() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
  } catch { /* storage blocked */ }
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  if (isNative()) return "";
  return `http://${window.location.hostname}:8000`;
}

export function setServerUrl(url) {
  const clean = url.trim().replace(/\/+$/, "");
  try { localStorage.setItem(KEY, clean); } catch { /* storage blocked */ }
  return clean;
}

export const needsSetup = () => isNative() && !getServerUrl();
export const apiBase = () => getServerUrl();
export const wsUrl = () => getServerUrl().replace(/^http/, "ws") + "/ws";

/** Normalise what a person types: "192.168.1.5" -> "http://192.168.1.5:8000". */
export function normalizeServerInput(raw) {
  let v = raw.trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  if (!/:\d+(\/|$)/.test(v.replace(/^https?:\/\//i, ""))) v += ":8000";
  return v.replace(/\/+$/, "");
}
