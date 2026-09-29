import { getLang } from "./i18n.js";

/* Spoken alerts are OFF by default; a driver switches them on in the Me tab.
   Spoken alerts via the platform speech engine (works in browsers and in the Android WebView).
   Falls back silently if the device has no voice for the chosen language. */
const KEY = "drishti_voice";
export const voiceEnabled = () => { try { return localStorage.getItem(KEY) === "on"; } catch { return false; } };
export const setVoiceEnabled = (on) => { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* ignore */ } if (!on) window.speechSynthesis?.cancel(); };

export function speak(text) {
  if (!voiceEnabled() || !text || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const lang = getLang() === "hi" ? "hi-IN" : "en-IN";
    u.lang = lang;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang === lang) || window.speechSynthesis.getVoices().find((x) => x.lang.startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* speech is a bonus, never load-bearing */ }
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}
