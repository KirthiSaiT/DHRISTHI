import React from "react";
import { useNavigate } from "react-router-dom";
import { AvatarRow, BrandMark, Icon } from "./ui.jsx";
import { getServerUrl } from "../config.js";
import { setLang, t, useLang } from "../i18n.js";

/* Landing screen — mirrors the reference: avatar ring row, giant tight
   headline with the inline status pill, one-line lede, blue + soft CTAs. */
export default function Welcome() {
  const nav = useNavigate();
  const lang = useLang();
  return (
    <div className="shell">
      <div className="topbar safe-top" style={{ height: "auto", minHeight: 52, borderBottom: "1px solid var(--line)" }}>
        <span className="brand"><BrandMark /> DRISHTI</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}><button className="chip" style={{ border: "none", cursor: "pointer" }} onClick={() => setLang(lang === "en" ? "hi" : "en")} aria-label="Change language">{lang === "en" ? "हिन्दी" : "English"}</button><span className="chip">SIH26007</span></span>
      </div>
      <div className="scroll">
        <div className="page" style={{ paddingTop: 36, textAlign: "center" }}>
          <AvatarRow />
          <h1 className="h-hero" style={{ marginTop: 28 }}>
            {t("welcome_h1a")}{" "}
            <span className="pill low" style={{ fontSize: "inherit" }}><span>{t("ship")}</span></span>{" "}
            {t("welcome_h1b")}
          </h1>
          <p className="lede" style={{ margin: "20px auto 0", maxWidth: 320 }}>
            {t("welcome_lede")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "28px auto 0", maxWidth: 320 }}>
            <button className="btn primary block" onClick={() => nav("/driver")}>
              <Icon name="truck" size={18} /> {t("open_driver")}
            </button>
            <button className="btn soft block" onClick={() => nav("/control")}>
              <Icon name="map" size={18} /> {t("open_control")}
            </button>
          </div>

          <div style={{ textAlign: "left", marginTop: 40 }}>
            <div className="h2" style={{ marginTop: 0 }}>What's inside</div>
            {[
              ["cloud", "Fog forecast", "Dew-point spread + humidity trend warn before fog forms."],
              ["sign", "Right-of-way", "Two trucks, one blind curve — the backend decides who goes."],
              ["shield", "Signed telemetry", "HMAC-signed readings with replay protection."],
            ].map(([ic, t, s]) => (
              <div className="row" key={t}>
                <span className="avatar" style={{ width: 40, height: 40, margin: 0, borderWidth: 2 }}><Icon name={ic} size={20} sw={1.6} /></span>
                <div className="grow"><div className="t">{t}</div><div className="s">{s}</div></div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
            <button className="btn ghost" style={{ height: 36, fontSize: 13 }} onClick={() => nav("/setup")}>
              <Icon name="wifi" size={16} /> {t("server")}: {getServerUrl().replace(/^https?:\/\//, "") || "not set"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
