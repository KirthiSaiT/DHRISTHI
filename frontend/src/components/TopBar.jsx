import React, { useEffect, useState } from "react";

export default function TopBar({ nodesOnline, userLabel }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      height: 64, flex: "none", display: "flex", alignItems: "center",
      justifyContent: "space-between", padding: "0 24px", borderBottom: "1px solid #1A2229",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: "var(--bg)",
            border: "1px solid var(--teal)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M2 12C4.5 7 8 5 12 5s7.5 2 10 7c-2.5 5-6 7-10 7s-7.5-2-10-7Z" stroke="var(--teal)" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="2.6" fill="var(--teal)" />
            </svg>
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, letterSpacing: "0.04em" }}>DRISHTI</span>
        </div>
        <span style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--text-faint)", borderLeft: "1px solid var(--border)", paddingLeft: 24 }}>
          CONTROL ROOM · ZONE 3
        </span>
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-dim)" }}>
        {time.toLocaleTimeString("en-IN", { hour12: false })} IST · Monsoon Shift
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="dot" style={{ background: "var(--green)" }} />
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{nodesOnline} nodes online</span>
        <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 6px" }} />
        <div style={{
          width: 30, height: 30, borderRadius: "50%", background: "var(--teal)", color: "var(--teal-ink)",
          display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12,
        }}>
          {userLabel ? userLabel.slice(0, 2).toUpperCase() : "?"}
        </div>
        <span style={{ fontSize: 13 }}>{userLabel || "Guest"}</span>
      </div>
    </div>
  );
}
