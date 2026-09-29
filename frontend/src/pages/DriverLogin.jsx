import React, { useState } from "react";

/*
  App-style lock screen for the driver device. On the real hardware node this
  step happens on the ESP32 itself (fingerprint sensor / RC522 RFID tag —
  see hardware/README.md "Driver auth event") and the truck simply won't
  "arm" until it succeeds; the node then POSTs the result to /api/auth.

  This screen is the software stand-in so the app is fully walkable before
  the physical sensors are wired in: it simulates the same two methods and
  hands off the same shape of identity (driver name + assigned node) that
  the real hardware auth event would produce. It never invents a fake
  "software login" for the truck itself — this is presented as mirroring
  the physical scan, not replacing it.
*/
export default function DriverLogin({ onAuthed }) {
  const [scanning, setScanning] = useState(null); // "fingerprint" | "rfid" | null
  const [driverName, setDriverName] = useState("R. Kumar");
  const [nodeId, setNodeId] = useState("NODE-A");

  function runScan(method) {
    if (scanning) return;
    setScanning(method);
    // Simulated scan latency, standing in for the sensor's real match time.
    window.setTimeout(() => {
      setScanning(null);
      onAuthed({ driverName, nodeId, method });
    }, 1100);
  }

  return (
    <div
      className="safe-top safe-bottom safe-x"
      style={{
        width: "100%",
        height: "100dvh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "48px 28px 32px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--bg)", border: "1px solid var(--teal)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 12C4.5 7 8 5 12 5s7.5 2 10 7c-2.5 5-6 7-10 7s-7.5-2-10-7Z" stroke="var(--teal)" strokeWidth="2" /><circle cx="12" cy="12" r="2.6" fill="var(--teal)" /></svg>
        </div>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, letterSpacing: "0.04em" }}>DRISHTI</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>Driver sign-in required before this unit arms</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <button
          onClick={() => runScan("fingerprint")}
          disabled={Boolean(scanning)}
          className="app-no-select"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            background: "transparent",
            border: "none",
            padding: 8,
          }}
        >
          <span
            className={scanning === "fingerprint" ? "pulse-ring" : ""}
            style={{
              width: 132,
              height: 132,
              borderRadius: "50%",
              border: `2px solid ${scanning === "fingerprint" ? "var(--teal)" : "var(--border)"}`,
              background: "var(--surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={scanning === "fingerprint" ? "var(--teal)" : "var(--text-dim)"} strokeWidth="1.4">
              <path d="M12 2a7 7 0 0 0-7 7c0 3.5 1.5 5.5 2 7" strokeLinecap="round" />
              <path d="M12 2a7 7 0 0 1 7 7c0 2-.4 3.3-1 4.5" strokeLinecap="round" />
              <path d="M8.5 20c-.7-1.5-1.5-3.5-1.5-6a5 5 0 0 1 10 0c0 1 -.1 1.8-.3 2.6" strokeLinecap="round" />
              <path d="M12 22c-1-1.6-1.8-3-2.2-4.6" strokeLinecap="round" />
              <path d="M15.5 17.5c.7-1.4 1-2.7 1-4.5" strokeLinecap="round" />
            </svg>
          </span>
          <span style={{ fontSize: 13, color: scanning === "fingerprint" ? "var(--teal)" : "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            {scanning === "fingerprint" ? "Scanning…" : "Tap to scan fingerprint"}
          </span>
        </button>

        <button
          onClick={() => runScan("rfid")}
          disabled={Boolean(scanning)}
          className="card app-no-select"
          style={{
            padding: "12px 22px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: scanning === "rfid" ? "var(--teal)" : "var(--text)",
            borderColor: scanning === "rfid" ? "var(--teal)" : "var(--border)",
            background: "transparent",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h6M7 14h3" strokeLinecap="round" /></svg>
          {scanning === "rfid" ? "Reading tag…" : "Or tap RFID tag"}
        </button>
      </div>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--text-faint)" }}>DRIVER (DEMO OVERRIDE)</label>
        <input
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          className="card"
          style={{ padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 13 }}
        />
        <label style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--text-faint)" }}>ASSIGNED NODE (DEMO OVERRIDE)</label>
        <select
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          className="card"
          style={{ padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 13 }}
        >
          <option value="NODE-A">NODE-A</option>
          <option value="NODE-B">NODE-B</option>
          <option value="NODE-C">NODE-C</option>
        </select>
        <span style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "center", marginTop: 4 }}>
          On the physical unit this is set by the enrolled fingerprint / RFID tag, not typed in.
        </span>
      </div>
    </div>
  );
}
