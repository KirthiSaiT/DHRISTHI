import React, { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Symbolic "windshield view" of the road ahead, built from data DRISHTI
 * actually has -- NOT a reconstruction from a real depth sensor (the kit has
 * no camera/radar/LiDAR). Two things are real, not decorative:
 *   - fog density is driven directly by the backend's fog-risk level
 *   - the hazard marker only appears when the node's motion sensor fires
 * Everything else (road geometry, camera angle) is a fixed stylized scene.
 */
const FOG_DENSITY = { LOW: 0.015, MEDIUM: 0.05, HIGH: 0.12 };
const FOG_COLOR = { LOW: 0x151e24, MEDIUM: 0x2a2f2e, HIGH: 0x3a2a2a };
const MARKER_COLOR = { LOW: 0x34d399, MEDIUM: 0xfbbf24, HIGH: 0xf87171 };

export default function FogRoadView({ riskLevel = "LOW", hazardActive = false }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});

  // One-time scene setup
  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1418);
    scene.fog = new THREE.FogExp2(0x151e24, FOG_DENSITY.LOW);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 1.6, 4.5);
    camera.lookAt(0, 0.5, -20);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x8899aa, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(2, 5, 2);
    scene.add(dir);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 200),
      new THREE.MeshStandardMaterial({ color: 0x1b242c })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -80;
    scene.add(ground);

    // Road strip + dashed centre line
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 200),
      new THREE.MeshStandardMaterial({ color: 0x232d38 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, -80);
    scene.add(road);

    for (let i = 0; i < 40; i++) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x3a4652 })
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.02, -i * 5);
      scene.add(dash);
    }

    // Truck marker (this vehicle)
    const truck = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 2),
      new THREE.MeshStandardMaterial({ color: 0x22c3b6 })
    );
    truck.position.set(0, 0.4, 3);
    scene.add(truck);

    // Hazard marker + pulsing range rings (hidden until hazardActive)
    const hazardGroup = new THREE.Group();
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf87171 })
    );
    hazardGroup.add(marker);
    const rings = [0.7, 1.1, 1.5].map((r) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.05, 32),
        new THREE.MeshBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      hazardGroup.add(ring);
      return ring;
    });
    hazardGroup.position.set(0.3, 0.5, -14);
    hazardGroup.visible = false;
    scene.add(hazardGroup);

    let frame;
    const clock = new THREE.Clock();
    function animate() {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      rings.forEach((ring, i) => {
        const s = 1 + 0.15 * Math.sin(t * 2 + i);
        ring.scale.set(s, s, 1);
      });
      truck.position.y = 0.4 + Math.sin(t * 3) * 0.01;
      renderer.render(scene, camera);
    }
    animate();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    stateRef.current = { scene, hazardGroup, marker };

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // React to live risk/hazard changes without rebuilding the scene
  useEffect(() => {
    const { scene, hazardGroup, marker } = stateRef.current;
    if (!scene) return;
    scene.fog.density = FOG_DENSITY[riskLevel] ?? FOG_DENSITY.LOW;
    scene.fog.color.set(FOG_COLOR[riskLevel] ?? FOG_COLOR.LOW);
    hazardGroup.visible = hazardActive;
    marker.material.color.set(MARKER_COLOR[riskLevel] ?? 0xf87171);
  }, [riskLevel, hazardActive]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
