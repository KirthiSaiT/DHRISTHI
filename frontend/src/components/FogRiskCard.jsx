import React from "react";
import { riskColor } from "../hooks/useDrishti.js";

export default function FogRiskCard({ node }) {
  if (!node) {
    return (
      <div className="card" style={{ padding: "18px 20px", color: "var(--text-faint)", fontSize: 12 }}>
        Select a node to see its fog-risk reading.
      </div>
    );
  }
  const risk = node.risk || {};
  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <span style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--text-faint)" }}>FOG RISK — {node.node_id}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 34, color: riskColor(risk.risk_level) }}>
          {risk.risk_level || "—"}
        </span>
        {risk.forming_soon && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>↗ fog forming</span>}
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)" }}>
        Dew-point spread {risk.dew_point_spread_c ?? "—"}°C · Humidity {node.humidity_pct ?? "—"}%
      </span>
    </div>
  );
}
