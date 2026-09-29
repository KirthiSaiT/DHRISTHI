import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import "./theme.css";
import { isNative } from "./config.js";
import { applyTheme } from "./theme.js";
import { getLang } from "./i18n.js";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

applyTheme();
document.documentElement.lang = getLang();

const root = ReactDOM.createRoot(document.getElementById("root"));

// Clerk is only used to gate the Control Room (operator login). If no key is
// configured yet, we skip ClerkProvider entirely and the app runs without
// auth -- lets the team keep building/demoing before Clerk is wired up.
const Tree = (
  <BrowserRouter>
    <App clerkEnabled={Boolean(clerkKey)} />
  </BrowserRouter>
);

root.render(
  <React.StrictMode>
    {clerkKey ? (
      <ClerkProvider publishableKey={clerkKey}>{Tree}</ClerkProvider>
    ) : (
      Tree
    )}
  </React.StrictMode>
);

// Registers the app-shell service worker so the driver PWA is installable
// and still opens (showing last-known state) if signal drops on the haul
// road. Never intercepts /api or /ws — see public/sw.js.
// The installed app ships its files inside the APK, so it needs no service worker.
if ("serviceWorker" in navigator && !isNative()) {
  window.addEventListener("load", () => {
    if (import.meta.env.DEV) {
      // Dev server: a cached shell only causes stale/blank pages, so remove any.
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline shell is a nice-to-have, not load-bearing for the app to work */
    });
  });
}
