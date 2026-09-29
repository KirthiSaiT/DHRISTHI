import React from "react";
import { toggleTheme, useTheme } from "../theme.js";

/* ---------- Icons (1.8px line, Notion-like) ---------- */
const PATHS = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  bell: "M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c0-4 3.5-6 8-6s8 2 8 6",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  sliders: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
  logout: "M16 17l5-5-5-5M21 12H9M13 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7",
  fingerprint: "M12 3a7 7 0 0 0-7 7c0 3.5 1.5 5.5 2 7M12 3a7 7 0 0 1 7 7c0 2-.4 3.3-1 4.5M8.5 21c-.7-1.5-1.5-3.5-1.5-6a5 5 0 0 1 10 0c0 1-.1 1.8-.3 2.6M12 22c-1-1.6-1.8-3-2.2-4.6M15.5 18c.7-1.4 1-2.7 1-4.5",
  card: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 10h6M7 14h3",
  eye: "M2 12c2.5-5 6-7 10-7s7.5 2 10 7c-2.5 5-6 7-10 7S4.5 17 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  truck: "M2 6h11v10H2zM13 9h5l3 3v4h-8zM6 19a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 6 19M17 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2",
  cloud: "M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 .5 9zM5 21h9M9 23h9",
  sign: "M12 3v18M5 6h11l3 3-3 3H5zM12 15h7",
  therm: "M10 4a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0z",
  radar: "M12 12l6-6M3 12a9 9 0 0 1 9-9M6 12a6 6 0 0 1 6-6M12 21a9 9 0 0 0 9-9",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  shield: "M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z",
  battery: "M3 8h15v8H3zM18 11h3v2h-3",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 13l4 4 10-10",
  wifi: "M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
  pin: "M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  play: "M7 4l13 8-13 8z",
  pause: "M7 4h4v16H7zM13 4h4v16h-4z",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  antenna: "M12 12v9M8 21h8M5 8a10 10 0 0 1 14 0M8 11a6 6 0 0 1 8 0",
};
export function Icon({ name, size = 20, stroke = "currentColor", sw = 1.8, fill = "none" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ""} />
    </svg>
  );
}

/* ---------- Brand ---------- */
export function BrandMark() {
  return (
    <span className="cube">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12c2.5-5 6-7 10-7s7.5 2 10 7c-2.5 5-6 7-10 7S4.5 17 2 12z" />
        <circle cx="12" cy="12" r="2.4" fill="currentColor" />
      </svg>
    </span>
  );
}

/* ---------- Risk helpers ---------- */
export const RISK = {
  LOW: { cls: "low", label: "Clear", tone: "green", emoji: "🟢" },
  MEDIUM: { cls: "medium", label: "Fog risk", tone: "amber", emoji: "🟡" },
  HIGH: { cls: "high", label: "Dense fog", tone: "red", emoji: "🔴" },
};
export const riskOf = (lvl) => RISK[lvl] || { cls: "none", label: "No data", tone: "", emoji: "⚪" };

/** The green "● Ship" pill from the reference — dot + label, sized by font-size of its parent. */
export function StatusPill({ level, small, children }) {
  const r = riskOf(level);
  return (
    <span className={`pill ${r.cls} ${small ? "sm" : ""}`}>
      <span>{children ?? r.label}</span>
    </span>
  );
}

/* ---------- Ringed avatar row ---------- */
const RINGS = [
  { ring: "#2383e2", bg: "var(--bg)", icon: "user" },
  { ring: "var(--ink)", bg: "var(--bg)", icon: "cloud" },
  { ring: "var(--ink)", bg: "#eb5757", icon: "sign", ink: "#fff" },
  { ring: "#f5a623", bg: "var(--bg)", icon: "truck" },
  { ring: "var(--ink)", bg: "var(--bg)", icon: "therm" },
  { ring: "var(--ink)", bg: "#5aa9f0", icon: "folder", ink: "#0f0f0f" },
  { ring: "#eb5757", bg: "var(--bg)", icon: "radar" },
];
export function AvatarRow() {
  return (
    <div className="avatars" aria-hidden="true">
      {RINGS.map((r, i) => (
        <span key={i} className="avatar" style={{ borderColor: r.ring, background: r.bg }}>
          <Icon name={r.icon} size={26} stroke={r.ink || "currentColor"} sw={1.6} />
        </span>
      ))}
    </div>
  );
}

/* ---------- Layout bits ---------- */
export function ThemeToggle() {
  const th = useTheme();
  return (
    <button className="iconbtn" onClick={toggleTheme} aria-label={th === "dark" ? "Switch to light mode" : "Switch to dark mode"} style={{ fontSize: 16 }}>
      {th === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

export function TopBar({ right, onBrand }) {
  return (
    <div className="topbar safe-top" style={{ height: "auto", minHeight: 52 }}>
      <button className="brand" onClick={onBrand} style={{ background: "none", border: "none", padding: 0 }}>
        <BrandMark />
        <span>DRISHTI</span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>{right}<ThemeToggle /></div>
    </div>
  );
}

export function LiveDot({ live }) {
  return (
    <span className={`chip ${live ? "green" : "amber"}`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} className={live ? "" : "blink"} />
      {live ? "Live" : "Offline"}
    </span>
  );
}

export function TabBar({ tabs, active, onChange }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {tabs.map((t) => (
        <button key={t.id} className={`tab ${active === t.id ? "on" : ""}`} onClick={() => onChange(t.id)} aria-current={active === t.id ? "page" : undefined}>
          <Icon name={t.icon} size={22} sw={active === t.id ? 2.2 : 1.7} />
          {t.label}
          {t.badge ? <span className="badge">{t.badge > 9 ? "9+" : t.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export function Callout({ tone = "", icon, title, children }) {
  return (
    <div className={`callout ${tone}`} role={tone === "red" ? "alert" : undefined}>
      <span className="ic">{icon}</span>
      <div>
        <b>{title}</b>
        {children ? <span>{children}</span> : null}
      </div>
    </div>
  );
}

export function Prop({ icon, k, children }) {
  return (
    <div className="prop">
      <div className="k">
        <Icon name={icon} size={16} />
        {k}
      </div>
      <div className="v">{children}</div>
    </div>
  );
}

export function secsAgo(ts) {
  if (!ts) return "—";
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

export function levelChip(level) {
  return { danger: "red", warning: "amber", info: "blue" }[level] || "";
}
