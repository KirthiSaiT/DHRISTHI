import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import RoadView from "./RoadView.jsx";
import { t, useLang } from "../i18n.js";

/*
  "See through the fog" windshield view.

  Symbolic, not a camera/radar reconstruction (the MVP kit has neither), but
  every dynamic element is driven by real backend data:
    - fog density        <- fog risk level (LOW / MEDIUM / HIGH)
    - hazard object      <- node motion trigger (hazard_active)
    - crossing truck +   <- right_of_way decision at the blind curve
      stop / go bar
    - fog bank marker    <- risk trend "fog forming"
  RAW shows what the driver's eyes see (thick fog hides everything).
  ASSIST is the enhanced view: fog cut back and hidden objects outlined
  so they're visible *through* the fog.
*/
const FOG_RAW = { LOW: 0.012, MEDIUM: 0.045, HIGH: 0.1 };
const FOG_ASSIST = 0.014;
const FOG_COLOR = 0xe6e9ec;
const curveX = (z) => 0.0016 * z * z; // gentle right-hand bend ahead

function ribbon(width, z0, z1, step, y) {
  const pos = [];
  const idx = [];
  let i = 0;
  for (let z = z0; z >= z1; z -= step) {
    const x = curveX(z);
    pos.push(x - width / 2, y, z, x + width / 2, y, z);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    i++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function outline(mesh, color) {
  const l = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color, fog: false, depthTest: false, transparent: true })
  );
  l.renderOrder = 10;
  l.position.copy(mesh.position);
  l.rotation.copy(mesh.rotation);
  l.scale.copy(mesh.scale).multiplyScalar(1.08);
  return l;
}

export default function FogVision({ level = "LOW", hazard = false, rightOfWay = null, forming = false, sharedDist = null }) {
  useLang();
  const mountRef = useRef(null);
  const api = useRef(null);
  const [mode, setMode] = useState("assist");
  const [failed, setFailed] = useState(false);

  // ---- one-time scene ----
  useEffect(() => {
    const mount = mountRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    const w = mount.clientWidth || 340, h = mount.clientHeight || 300;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_ASSIST);

    const camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 400);
    camera.position.set(0, 2.3, 8);
    camera.lookAt(0, 1.4, -30);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bec4, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(-4, 10, 6);
    scene.add(sun);

    // ground + road + shoulders
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0xd9dcd6 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -120);
    scene.add(ground);
    scene.add(new THREE.Mesh(ribbon(7.6, 12, -200, 2, 0.0), new THREE.MeshLambertMaterial({ color: 0xc4c8cc })));
    scene.add(new THREE.Mesh(ribbon(6.2, 12, -200, 2, 0.02), new THREE.MeshLambertMaterial({ color: 0x8a9096 })));

    // hills (silhouette, fade into fog)
    for (let i = 0; i < 9; i++) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(18 + (i % 3) * 8, 16 + (i % 4) * 6, 5), new THREE.MeshLambertMaterial({ color: 0xc9cdc6 }));
      hill.position.set(-46 + i * 12, 6, -95 - (i % 3) * 25);
      scene.add(hill);
    }

    // moving lane dashes + roadside reflector poles
    const dashes = [];
    const poles = [];
    const DASH_GAP = 6, N = 30;
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < N; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.2), dashMat);
      d.rotation.x = -Math.PI / 2;
      scene.add(d);
      dashes.push(d);
    }
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
    const capMat = new THREE.MeshBasicMaterial({ color: 0xf5a623 });
    for (let i = 0; i < 16; i++) {
      for (const side of [-1, 1]) {
        const p = new THREE.Group();
        const s = new THREE.Mesh(poleGeo, poleMat); s.position.y = 0.7; p.add(s);
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), capMat); c.position.y = 1.45; p.add(c);
        p.userData.side = side;
        scene.add(p);
        poles.push(p);
      }
    }

    // this truck's hood hint
    const hood = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 2.4), new THREE.MeshLambertMaterial({ color: 0x0075de }));
    hood.position.set(0, 0.55, 5.6);
    scene.add(hood);

    // hazard (rock/cone) + pulse rings + assist outline + beam
    const hazardGroup = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), new THREE.MeshLambertMaterial({ color: 0x6b6f73 }));
    rock.position.y = 0.7;
    hazardGroup.add(rock);
    const rockOutline = outline(rock, 0xe03e3e);
    hazardGroup.add(rockOutline);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xe03e3e, fog: false, depthTest: false, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const rings = [1.5, 2.1].map((r) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.09, 40), ringMat.clone());
      m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.renderOrder = 10;
      hazardGroup.add(m);
      return m;
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 9, 6), new THREE.MeshBasicMaterial({ color: 0xe03e3e, fog: false, depthTest: false, transparent: true, opacity: 0.7 }));
    beam.position.y = 4.5; beam.renderOrder = 10;
    hazardGroup.add(beam);
    const HZ = -30;
    hazardGroup.position.set(curveX(HZ) + 0.6, 0, HZ);
    hazardGroup.visible = false;
    scene.add(hazardGroup);

    // crossing truck (shown when this truck must yield) + assist outline
    const other = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0xf5a623 }));
    body.position.y = 1.5;
    other.add(body);
    const otherOutline = outline(body, 0xdd8a00);
    other.add(otherOutline);
    other.visible = false;
    scene.add(other);

    // stop / go bar across the lane at the curve + assist-only fog bank marker
    const barMat = new THREE.MeshBasicMaterial({ color: 0xe03e3e, fog: false, transparent: true, opacity: 0.85, depthTest: false });
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.7), barMat);
    bar.rotation.x = -Math.PI / 2; bar.position.set(curveX(-16), 0.06, -16); bar.renderOrder = 9; bar.visible = false;
    scene.add(bar);

    const bank = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 22), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
    bank.position.set(curveX(-75), 3.5, -75); bank.visible = false;
    const bankEdges = new THREE.LineSegments(new THREE.EdgesGeometry(bank.geometry), new THREE.LineBasicMaterial({ color: 0x0075de, fog: false }));
    bank.add(bankEdges);
    scene.add(bank);

    let raf, cross = 0;
    const clock = new THREE.Clock();
    function tick() {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      const off = (t * 9) % DASH_GAP;
      dashes.forEach((d, i) => { const z = 6 - i * DASH_GAP + off; d.position.set(curveX(z), 0.04, z); });
      poles.forEach((p, i) => { const z = 6 - Math.floor(i / 2) * 12 + ((t * 9) % 12); p.position.set(curveX(z) + p.userData.side * 4.4, 0, z); });
      const s = 1 + 0.12 * Math.sin(t * 3);
      rings.forEach((r, i) => { r.scale.setScalar(s + i * 0.1); });
      beam.material.opacity = 0.45 + 0.3 * Math.sin(t * 4);
      camera.position.y = 2.3 + Math.sin(t * 2.4) * 0.02;
      if (other.visible) { // crossing truck rolls onto the road, then loops
        cross = (cross + 0.0035) % 1;
        other.position.set(curveX(-22) + 16 - cross * 18, 0, -22);
        other.rotation.y = Math.PI / 2;
      }
      renderer.render(scene, camera);
    }
    tick();

    const ro = new ResizeObserver(() => {
      const W = mount.clientWidth, H = mount.clientHeight;
      if (!W || !H) return;
      camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
    });
    ro.observe(mount);

    api.current = { scene, hazardGroup, rockOutline, rings, beam, other, otherOutline, bar, barMat, bank };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ---- react to live data without rebuilding the scene ----
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const assist = mode === "assist";
    a.scene.fog.density = assist ? FOG_ASSIST : FOG_RAW[level] ?? FOG_RAW.LOW;

    // own obstacle sits 30 units ahead; an obstacle another truck reported sits at a distance that follows the real gap
    const hz = hazard ? -30 : sharedDist != null ? -Math.max(16, Math.min(60, sharedDist / 8)) : -30;
    a.hazardGroup.position.set(curveX(hz) + 0.6, 0, hz);
    a.hazardGroup.visible = hazard || sharedDist != null;
    [a.rockOutline, a.beam, ...a.rings].forEach((o) => { o.visible = assist; });

    const yielding = rightOfWay === "yield";
    a.other.visible = yielding;
    a.otherOutline.visible = assist;

    const showBar = assist && (yielding || rightOfWay === "proceed");
    a.bar.visible = showBar;
    a.barMat.color.set(yielding ? 0xe03e3e : 0x1aae39);

    a.bank.visible = assist && (forming || level === "HIGH");
  }, [mode, level, hazard, rightOfWay, forming, sharedDist]);

  if (failed) return <RoadView level={level} hazard={hazard} />;

  const note = sharedDist != null && !hazard
    ? t("note_shared")
    : hazard
    ? mode === "assist" ? t("note_haz_assist") : t("note_haz_raw")
    : rightOfWay === "yield"
    ? t("note_yield")
    : rightOfWay === "proceed"
    ? t("note_go")
    : forming || level === "HIGH"
    ? mode === "assist" ? t("note_fog_assist") : t("note_fog_raw")
    : t("clear_road");

  return (
    <div style={{ position: "relative", height: 300, background: "#e6e9ec" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", top: 10, right: 10, display: "flex", background: "rgba(255,255,255,.92)", borderRadius: 8, padding: 2, boxShadow: "0 1px 4px rgba(0,0,0,.15)" }} role="group" aria-label="View mode">
        {[["assist", t("assist")], ["raw", t("raw")]].map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
            style={{ border: "none", borderRadius: 6, padding: "5px 11px", fontSize: 12, fontWeight: 600, background: mode === m ? "#0075de" : "transparent", color: mode === m ? "#fff" : "#37352f" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ position: "absolute", left: 10, bottom: 10, right: 10 }}>
        <span style={{ display: "inline-block", background: "rgba(255,255,255,.94)", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontWeight: 600, color: hazard ? "#a4201b" : "#37352f", boxShadow: "0 1px 4px rgba(0,0,0,.12)" }}>
          {note}
        </span>
      </div>
    </div>
  );
}
