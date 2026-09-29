import React from "react";
import { riskColor } from "../hooks/useDrishti.js";

// Fixed demo positions until the NEO-6M feeds real GPS.
const LAYOUT = {
  "NODE-A": { x: 70, y: 168 },
  "NODE-B": { x: 190, y: 108 },
  "NODE-C": { x: 296, y: 66 },
};
const FALLBACK = [{ x: 120, y: 60 }, { x: 250, y: 150 }, { x: 60, y: 90 }];

export default function MapCard({ nodes, selected, onSelect }) {
  let extra = 0;
  return (
    <div className="card">
      <svg viewBox="0 0 360 220" width="100%" style={{ display: "block", background: "#f7f7f5" }} role="img" aria-label="Haul road map with fog risk per node">
        {/* contour lines */}
        <path d="M-10 150 C 60 110,110 170,180 120 S 300 60,370 90" fill="none" stroke="#e3e2de" strokeWidth="1.5" />
        <path d="M-10 110 C 70 70,120 130,190 80 S 300 30,370 50" fill="none" stroke="#e9e8e4" strokeWidth="1.5" />
        {/* haul road */}
        <path d="M-10 200 C 60 190,90 150,150 130 S 260 90,300 60 S 350 40,375 30" fill="none" stroke="#0f0f0f" strokeWidth="9" strokeLinecap="round" opacity="0.08" />
        <path d="M-10 200 C 60 190,90 150,150 130 S 260 90,300 60 S 350 40,375 30" fill="none" stroke="#0f0f0f" strokeWidth="2" strokeDasharray="6 6" strokeLinecap="round" />
        {nodes.map((n) => {
          const pos = LAYOUT[n.node_id] || FALLBACK[extra++ % FALLBACK.length];
          const c = riskColor(n.risk?.risk_level);
          const on = selected === n.node_id;
          return (
            <g key={n.node_id} onClick={() => onSelect?.(n.node_id)} style={{ cursor: "pointer" }}>
              <circle cx={pos.x} cy={pos.y} r={on ? 26 : 20} fill={c} opacity="0.16" />
              <circle cx={pos.x} cy={pos.y} r="9" fill={c} stroke="#0f0f0f" strokeWidth="2" />
              {n.hazard_active && <path d={`M${pos.x} ${pos.y - 32} l8 14 h-16 z`} fill="#e03e3e" stroke="#0f0f0f" strokeWidth="1.6" strokeLinejoin="round" />}
              <text x={pos.x} y={pos.y + 30} textAnchor="middle" fontSize="11" fontWeight="600" fill="#37352f" fontFamily="Inter, sans-serif">
                {n.node_id.replace("NODE-", "Truck ")}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, padding: "10px 14px", fontSize: 12, color: "var(--ink-3)", borderTop: "1px solid var(--line)" }}>
        {[["LOW", "Clear"], ["MEDIUM", "Fog risk"], ["HIGH", "Dense fog"]].map(([l, t]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: riskColor(l) }} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
