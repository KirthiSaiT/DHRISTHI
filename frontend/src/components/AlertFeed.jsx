import React from "react";

export default function AlertFeed({ alerts }) {
  return (
    <div className="card" style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--text-faint)" }}>ALERT FEED</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
        {alerts.length === 0 && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No alerts yet.</span>}
        {alerts.map((a) => (
          <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div className="dot" style={{ width: 6, height: 6, background: a.color, marginTop: 6, flex: "none" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}>{a.text}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)" }}>{a.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
