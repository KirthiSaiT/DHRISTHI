import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDrishti, riskColor } from "../hooks/useDrishti.js";
import FogRoadView from "../components/FogRoadView.jsx";
import InstallPrompt from "../components/InstallPrompt.jsx";
import DriverLogin from "./DriverLogin.jsx";

const SESSION_KEY = "drishti_driver_session";

export default function DriverPage() {
  const [params] = useSearchParams();
  const [session, setSession] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // A dispatch-generated link (?node=&driver=) skips the on-device scan —
  // otherwise the driver has to sign in on this device first, same as the
  // truck won't arm without a fingerprint/RFID match on the real hardware.
  const linkedSession = params.get("node")
    ? { nodeId: params.get("node"), driverName: params.get("driver") || "R. KUMAR", method: "dispatch-link" }
    : null;

  const active = linkedSession || session;

  if (!active) {
    return (
      <DriverLogin
        onAuthed={(s) => {
          try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
          } catch {
            /* storage blocked — session just won't persist a reload */
          }
          setSession(s);
        }}
      />
    );
  }

  return <DriverHome nodeId={active.nodeId} driverName={active.driverName} />;
}

function DriverHome({ nodeId, driverName }) {
  const { nodes, live } = useDrishti();
  const node = nodes.find((n) => n.node_id === nodeId);
  const risk = node?.risk?.risk_level || "LOW";
  const hazard = Boolean(node?.hazard_active);
  const wasHazard = useRef(false);

  useEffect(() => {
    if (hazard && !wasHazard.current && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]); // stand-in for the physical buzzer
    }
    wasHazard.current = hazard;
  }, [hazard]);

  return (
    <div style={{ width: "100%", height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div className="safe-top safe-x" style={{ minHeight: 56, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", borderBottom: "1px solid #1A2229" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--bg)", border: "1px solid var(--teal)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M2 12C4.5 7 8 5 12 5s7.5 2 10 7c-2.5 5-6 7-10 7s-7.5-2-10-7Z" stroke="var(--teal)" strokeWidth="2" /><circle cx="12" cy="12" r="2.6" fill="var(--teal)" /></svg>
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 13, letterSpacing: "0.04em" }}>DRISHTI</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{driverName}</span>
          <div className="dot" style={{ background: live ? "var(--green)" : "var(--amber)" }} />
          <button
            onClick={() => {
              try {
                sessionStorage.removeItem(SESSION_KEY);
              } catch {
                /* ignore */
              }
              window.location.href = "/driver";
            }}
            aria-label="Switch driver"
            style={{ background: "transparent", border: "none", color: "var(--text-faint)", padding: 4, display: "flex" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" /><path d="M13 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {hazard && (
        <div style={{ flex: "none", background: "#3A1518", borderBottom: "1px solid #5A2229", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <div className="dot" style={{ width: 9, height: 9, background: "var(--red)" }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "#FCA5A5" }}>OBSTACLE AHEAD — REDUCE SPEED</span>
        </div>
      )}

      <div style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
        <div className="card" style={{ padding: 20, textAlign: "center", borderColor: hazard ? "#5A2229" : "var(--border)" }}>
          <span style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--text-faint)" }}>CURRENT FOG RISK</span>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 44, color: riskColor(risk), margin: "6px 0" }}>{risk}</div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)" }}>
            {node ? `Dew-point spread ${node.risk.dew_point_spread_c}°C` : "Waiting for sensor data…"}
          </span>
        </div>

        <div className="card" style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 220, borderColor: hazard ? "#5A2229" : "var(--border)" }}>
          <FogRoadView riskLevel={risk} hazardActive={hazard} />
          <span style={{ position: "absolute", bottom: 10, left: 14, fontSize: 11, color: "var(--text)", background: "#0A0E1299", padding: "3px 8px", borderRadius: 6 }}>
            {hazard ? "Hazard detected ahead (approx.)" : "Live road view — conceptual visualization"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div className="card" style={{ flex: 1, padding: "12px 14px" }}>
            <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.06em" }}>TEMP</span>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18 }}>{node ? `${node.temp_c}°C` : "—"}</div>
          </div>
          <div className="card" style={{ flex: 1, padding: "12px 14px" }}>
            <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.06em" }}>HUMIDITY</span>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18 }}>{node ? `${node.humidity_pct}%` : "—"}</div>
          </div>
        </div>
      </div>

      <div className="safe-bottom safe-x" style={{ minHeight: 48, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", borderTop: "1px solid #1A2229" }}>
        <span style={{ fontSize: 12, color: live ? "var(--green)" : "var(--amber)" }}>
          {live ? "● LIVE — synced" : "● CACHED — reconnecting"}
        </span>
        {hazard && <span style={{ fontSize: 12, color: "var(--red)" }}>ALERT ACTIVE</span>}
      </div>

      <InstallPrompt />
    </div>
  );
}
