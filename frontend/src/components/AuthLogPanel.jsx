import React from "react";

export default function AuthLogPanel({ authLog }) {
  return (
    <div className="card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.06em", color: "var(--text-faint)" }}>DRIVER AUTHENTICATION</span>
      {authLog.length === 0 && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No logins yet.</span>}
      {authLog.map((au) => (
        <div key={au.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
          <span style={{ color: au.success ? "var(--text)" : "var(--red)" }}>
            {au.driver_id} · {au.node_id} {au.success ? "" : "· FAILED"}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{au.method} · {au.time}</span>
        </div>
      ))}
    </div>
  );
}
