import React from "react";
import { riskColor } from "../hooks/useDrishti.js";

function secsAgo(ts) {
  if (!ts) return "—";
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

export default function NodeHealthStrip({ nodes }) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {nodes.length === 0 && (
        <div className="card" style={{ flex: 1, padding: "12px 16px", color: "var(--text-faint)", fontSize: 12 }}>
          No nodes reporting yet — start the simulator or connect the ESP32.
        </div>
      )}
      {nodes.map((n) => (
        <div key={n.node_id} className="card" style={{ flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>{n.node_id}</span>
            <div className="dot" style={{ background: riskColor(n.risk?.risk_level) }} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
            Battery {n.battery_pct != null ? `${Math.round(n.battery_pct)}%` : "—"} · Last seen {secsAgo(n.last_seen)}
            {!n.signed && <span style={{ color: "var(--amber)" }}> · unsigned</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
