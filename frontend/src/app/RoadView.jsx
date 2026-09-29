import React from "react";

/*
  Flat, line-art "road ahead" illustration (Notion-doodle style). It is
  symbolic — NOT a camera/radar reconstruction (the MVP kit has neither).
  What IS real: fog opacity follows the backend risk level, and the hazard
  marker only appears when the node's motion sensor fires.
*/
const FOG = { LOW: 0.1, MEDIUM: 0.45, HIGH: 0.85 };

export default function RoadView({ level = "LOW", hazard = false }) {
  const fog = FOG[level] ?? 0.1;
  return (
    <svg viewBox="0 0 360 220" width="100%" role="img" aria-label={`Road ahead, fog risk ${level}${hazard ? ", obstacle ahead" : ""}`} style={{ display: "block", background: "#f7f7f5" }}>
      {/* hills */}
      <path d="M0 110 L60 70 L120 100 L190 55 L260 98 L310 75 L360 105 V120 H0Z" fill="#ecebe8" stroke="#0f0f0f" strokeWidth="2" strokeLinejoin="round" />
      {/* road */}
      <path d="M150 112 L210 112 L330 220 H30 Z" fill="#fff" stroke="#0f0f0f" strokeWidth="2.5" strokeLinejoin="round" />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${180} ${122 + i * 24} v${8 + i * 3}`} stroke="#0f0f0f" strokeWidth={2 + i * 0.7} strokeLinecap="round" />
      ))}
      {/* this truck */}
      <g transform="translate(150 168)" stroke="#0f0f0f" strokeWidth="2.2" strokeLinejoin="round" fill="#fff">
        <rect x="0" y="0" width="60" height="34" rx="6" fill="#0075de" />
        <rect x="8" y="5" width="44" height="12" rx="3" fill="#fff" />
        <circle cx="12" cy="34" r="5" fill="#0f0f0f" />
        <circle cx="48" cy="34" r="5" fill="#0f0f0f" />
      </g>
      {/* hazard */}
      {hazard && (
        <g className="blink" transform="translate(196 132)">
          <path d="M0 -16 L16 12 H-16 Z" fill="#e03e3e" stroke="#0f0f0f" strokeWidth="2" strokeLinejoin="round" />
          <path d="M0 -5 V4M0 8 v.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}
      {/* fog layers */}
      <g className="drift" style={{ opacity: fog }}>
        <ellipse cx="90" cy="118" rx="120" ry="22" fill="#fff" />
        <ellipse cx="270" cy="136" rx="130" ry="26" fill="#fff" />
        <ellipse cx="180" cy="160" rx="170" ry="30" fill="#fff" />
      </g>
      <rect width="360" height="220" fill="#fff" opacity={fog * 0.35} />
    </svg>
  );
}
