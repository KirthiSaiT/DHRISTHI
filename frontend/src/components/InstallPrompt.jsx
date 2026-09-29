import React, { useEffect, useState } from "react";

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/*
  Thin "install as app" banner for the driver PWA. Chrome/Android fires
  beforeinstallprompt and we can trigger the native install sheet directly;
  iOS Safari never fires that event, so we show it how to do the same thing
  manually (Share -> Add to Home Screen). Dismiss is remembered per-device
  (localStorage) so it doesn't nag on every open.
*/
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("drishti_install_dismissed") === "1";
    } catch {
      return false;
    }
  });
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissed) return;

    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    if (isIOS()) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [dismissed]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem("drishti_install_dismissed", "1");
    } catch {
      /* private browsing / storage blocked — banner just won't persist dismissal */
    }
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  if (isStandalone() || dismissed || (!deferredPrompt && !showIosHint)) return null;

  return (
    <div
      className="card safe-x"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        zIndex: 50,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderColor: "var(--teal)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ width: 30, height: 30, flex: "none", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--teal)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M2 12C4.5 7 8 5 12 5s7.5 2 10 7c-2.5 5-6 7-10 7s-7.5-2-10-7Z" stroke="var(--teal)" strokeWidth="2" /><circle cx="12" cy="12" r="2.6" fill="var(--teal)" /></svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Install DRISHTI</div>
        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {deferredPrompt ? "Runs full-screen, works when signal drops." : "Share icon → Add to Home Screen"}
        </div>
      </div>
      {deferredPrompt ? (
        <button onClick={install} style={{ background: "var(--teal)", color: "#062421", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>
          Install
        </button>
      ) : null}
      <button onClick={dismiss} aria-label="Dismiss" style={{ background: "transparent", border: "none", color: "var(--text-faint)", fontSize: 16, padding: 4 }}>
        ✕
      </button>
    </div>
  );
}
