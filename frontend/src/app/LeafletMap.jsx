import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { riskColor } from "../hooks/useDrishti.js";

/*
  Live fleet map on OpenStreetMap tiles (the same map data Organic Maps uses).
    - road segments are coloured by the fog risk of the nearest weather station
    - the GPS-shadow stretch and its roadside beacons are marked; a truck whose
      GPS is shadowed shows a "ghost" at the raw (wrong) GPS fix, joined to its
      beacon-corrected position
    - weather stations show their fog risk and forecast
    - trucks are markers with fleet ID + load; tapping one selects it
*/
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtEta = (s) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);
const SRC = { BEACON: ["BCN", "ok"], GPS_DEGRADED: ["GPS?", "bad"] };

function truckIcon(n, selected) {
  const c = riskColor(n.risk?.risk_level);
  const loaded = n.load?.state === "LOADED";
  const badge = loaded ? `${Math.round(n.load.tonnes)} t` : "Empty";
  const [srcTxt, srcCls] = SRC[n.pos_src] || [];
  return L.divIcon({
    className: "",
    iconSize: [70, 64],
    iconAnchor: [35, 22],
    html: `<div class="tm ${selected ? "sel" : ""}">
      <div class="tm-dot" style="border-color:${c}">🚚${n.hazard_active ? '<i class="tm-haz">!</i>' : ""}</div>
      <div class="tm-lab"><b>${esc(n.vehicle?.fleet_id || n.node_id)}</b><span class="${loaded ? "ld" : ""}">${badge}</span>${srcTxt ? `<em class="src ${srcCls}">${srcTxt}</em>` : ""}</div>
    </div>`,
  });
}

const pinIcon = (emoji, label) =>
  L.divIcon({ className: "", iconSize: [80, 40], iconAnchor: [40, 14], html: `<div class="tm"><div class="tm-pin">${emoji}</div><div class="tm-lab"><b>${esc(label)}</b></div></div>` });

function stationIcon(s) {
  const c = riskColor(s.risk?.risk_level);
  const fc = s.forecast ? `<span class="fc">fog in ~${fmtEta(s.forecast.eta_s)}</span>` : "";
  return L.divIcon({
    className: "", iconSize: [110, 44], iconAnchor: [55, 12],
    html: `<div class="tm"><div class="tm-st" style="border-color:${c};color:${c}">☁</div><div class="tm-lab" style="max-width:110px"><b>${esc(s.name.split(" (")[0])}</b>${fc}</div></div>`,
  });
}

export default function LeafletMap({ nodes, mapData, stations = [], segments = [], hazards = [], selected, onSelect, height = 340 }) {
  const el = useRef(null);
  const st = useRef({ markers: {}, fitted: false });
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const map = L.map(el.current, { zoomControl: false, attributionControl: true, tap: true }).setView([18.642, 81.264], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    st.current = { map, base: L.layerGroup().addTo(map), dyn: L.layerGroup().addTo(map), markers: {}, fitted: false };
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); map.remove(); st.current = { markers: {}, fitted: false }; };
  }, []);

  // ---- static geometry (rebuilt only when what it shows changes) ----
  const contest = nodes.some((n) => n.row && n.row.decision === "yield");
  const reroute = nodes.some((n) => n.row?.action === "reroute");
  const segSig = segments.join(",");
  useEffect(() => {
    const { map, base } = st.current;
    if (!map || !mapData) return;
    base.clearLayers();
    L.polyline(mapData.shadow, { color: "#e03e3e", weight: 22, opacity: 0.16, lineCap: "butt" }).addTo(base);
    L.polyline(mapData.bypass, { color: reroute ? "#0075de" : "#9aa3ab", weight: reroute ? 6 : 4, dashArray: "8 8", opacity: reroute ? 1 : 0.8 }).addTo(base);
    L.polyline(mapData.route, { color: "#ffffff", weight: 9, opacity: 0.95 }).addTo(base);
    // fog-coloured segments
    (mapData.segments || []).forEach((s, i) => {
      const lvl = segments[i] || "LOW";
      L.polyline(s.path, { color: riskColor(lvl), weight: 8, opacity: lvl === "LOW" ? 0.55 : 0.9, lineCap: "butt" }).addTo(base);
    });
    L.polyline(mapData.route, { color: "#37352f", weight: 2, opacity: 0.7 }).addTo(base);
    mapData.zones.forEach((z) =>
      L.circle(z.center, { radius: z.radius_m, color: contest ? "#dd8a00" : "#787774", weight: 2, fillColor: contest ? "#dd8a00" : "#787774", fillOpacity: contest ? 0.22 : 0.08, dashArray: "4 6" }).addTo(base));
    (mapData.beacons || []).forEach((b) => L.marker(b.pos, { icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="tm-bcn" title="${esc(b.id)}">📡</div>` }), interactive: false }).addTo(base));
    L.marker(mapData.pit.pos, { icon: pinIcon("⛏️", "Pit 14"), interactive: false }).addTo(base);
    L.marker(mapData.crusher.pos, { icon: pinIcon("🏭", "Crusher"), interactive: false }).addTo(base);
    if (!st.current.fitted) { map.fitBounds(L.latLngBounds(mapData.route.concat(mapData.bypass)), { padding: [24, 24] }); st.current.fitted = true; }
  }, [mapData, contest, reroute, segSig]);

  // ---- stations + raw-GPS ghosts (cheap; rebuilt on every update) ----
  useEffect(() => {
    const { map, dyn } = st.current;
    if (!map) return;
    dyn.clearLayers();
    stations.forEach((s) => L.marker(s.pos, { icon: stationIcon(s), interactive: false, zIndexOffset: 100 }).addTo(dyn));
    hazards.forEach((h) => {
      L.circle([h.lat, h.lon], { radius: 60, color: "#e03e3e", weight: 1, fillColor: "#e03e3e", fillOpacity: 0.12, dashArray: "3 4" }).addTo(dyn);
      L.marker([h.lat, h.lon], { icon: pinIcon("🚧", h.fleet_id || "Obstacle"), interactive: false, zIndexOffset: 300 }).addTo(dyn);
    });
    nodes.forEach((n) => {
      if (n.raw_gps && n.pos_src === "BEACON" && n.lat != null) {
        L.polyline([n.raw_gps, [n.lat, n.lon]], { color: "#e03e3e", weight: 2, dashArray: "3 4" }).addTo(dyn);
        L.circleMarker(n.raw_gps, { radius: 6, color: "#e03e3e", weight: 2, fillColor: "#fff", fillOpacity: 1 }).bindTooltip("raw GPS", { permanent: false }).addTo(dyn);
      }
    });
  }, [nodes, stations, hazards]);

  // ---- truck markers (icon rebuilt only when what it shows changes, so taps are never lost mid-refresh) ----
  useEffect(() => {
    const { map, markers } = st.current;
    if (!map) return;
    const seen = new Set();
    nodes.forEach((n) => {
      if (n.lat == null || n.lon == null) return;
      seen.add(n.node_id);
      const sig = [n.risk?.risk_level, n.load?.state, Math.round(n.load?.tonnes || 0), n.hazard_active, n.pos_src, selected === n.node_id].join("|");
      let m = markers[n.node_id];
      if (!m) {
        m = { marker: L.marker([n.lat, n.lon], { icon: truckIcon(n, selected === n.node_id), zIndexOffset: 500 }).addTo(map), sig };
        m.marker.on("click", (e) => { L.DomEvent.stopPropagation(e); selectRef.current?.(n.node_id); });
        markers[n.node_id] = m;
      } else {
        m.marker.setLatLng([n.lat, n.lon]);
        if (m.sig !== sig) { m.marker.setIcon(truckIcon(n, selected === n.node_id)); m.sig = sig; }
      }
    });
    Object.keys(markers).forEach((id) => { if (!seen.has(id)) { markers[id].marker.remove(); delete markers[id]; } });
  }, [nodes, selected]);

  return <div ref={el} className="leaflet-host" style={{ height, width: "100%" }} role="application" aria-label="Fleet map" />;
}
