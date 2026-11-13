import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CaseBox } from '../types';
import { buildTacticalCaseGroup, detectSoftwareWebGL } from '../utils/caseModel3D';
import { soundFX } from '../utils/sound';
import { CaseThumbnail3D } from './CaseThumbnail3D';

interface CaseStage3DProps {
  caseBox: CaseBox;
  isOpeningLid: boolean;
  entryKey: number;
}

// Locked-off fixed CS2 inspection camera framed cleanly so the full 90° open lid + volumetric glow stay unclipped
const _camBase = new THREE.Vector3(0, 1.72, 5.45);
const _lookTarget = new THREE.Vector3(0, 0.72, 0);

const SETTLED_ROT_Y = -0.44;
const SETTLED_ROT_X = 0.02;

function createSoftParticleTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 245, 230, 0.65)');
  grad.addColorStop(0.75, 'rgba(220, 225, 235, 0.16)');
  grad.addColorStop(1, 'rgba(220, 225, 235, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function createDustRingTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 44, 128, 128, 124);
  grad.addColorStop(0, 'rgba(210, 214, 224, 0)');
  grad.addColorStop(0.55, 'rgba(210, 214, 224, 0.26)');
  grad.addColorStop(0.82, 'rgba(180, 190, 205, 0.12)');
  grad.addColorStop(1, 'rgba(180, 190, 205, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function createGroundShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 122);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.82)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.38)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function easeOutCubic(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const CaseStage3D: React.FC<CaseStage3DProps> = ({ caseBox, isOpeningLid, entryKey }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const openingLidRef = useRef(isOpeningLid);
  const openingStartedAtRef = useRef<number | null>(isOpeningLid ? performance.now() : null);
  const pointerTiltRef = useRef({ targetRotY: SETTLED_ROT_Y, targetRotX: SETTLED_ROT_X, dragging: false, lastX: 0 });
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    openingLidRef.current = isOpeningLid;
    if (isOpeningLid) {
      if (openingStartedAtRef.current === null) {
        openingStartedAtRef.current = performance.now();
      }
    } else {
      openingStartedAtRef.current = null;
    }
  }, [isOpeningLid]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(240, container.clientHeight);

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 40);
    const applyResponsiveCameraFraming = (w: number, h: number) => {
      const aspect = w / h;
      const distScale = aspect < 1.6 ? Math.min(1.65, 1.6 / Math.max(0.85, aspect)) : 1;
      camera.aspect = aspect;
      camera.position.set(_camBase.x, _camBase.y * (1 + (distScale - 1) * 0.18), _camBase.z * distScale);
      camera.lookAt(_lookTarget);
      camera.updateProjectionMatrix();
    };
    // Locked-off fixed CS2 inspection camera framed for both settled pose and 90° open lid
    applyResponsiveCameraFraming(width, height);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // Preserve studio 3-point lighting so case blends cleanly into existing stage background
    const hemi = new THREE.HemisphereLight(0xe0ecff, 0x181c24, 0.9);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.7);
    keyLight.position.set(3.4, 5.4, 3.8);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 16;
      keyLight.shadow.camera.left = -2.8;
      keyLight.shadow.camera.right = 2.8;
      keyLight.shadow.camera.top = 2.8;
      keyLight.shadow.camera.bottom = -2.8;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x67e8f9, 1.35);
    rimLight.position.set(-4.0, 2.8, -2.6);
    scene.add(rimLight);

    // Subtle ground stage plane for contact shadow + radial dust puff
    const shadowTex = createGroundShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(4.1, 2.9);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.18,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.005;
    scene.add(shadowPlane);

    const dustRingTex = createDustRingTexture();
    const dustRingGeo = new THREE.PlaneGeometry(3.6, 2.8);
    const dustRingMat = new THREE.MeshBasicMaterial({
      map: dustRingTex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const dustRing = new THREE.Mesh(dustRingGeo, dustRingMat);
    dustRing.rotation.x = -Math.PI / 2;
    dustRing.position.y = 0.016;
    scene.add(dustRing);

    // 3D Floor Impact Dust Particles (THREE.Points bursting outward upon impact)
    const particleTex = createSoftParticleTexture();
    const DUST_COUNT = 56;
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    const dustVel = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      const ang = (i / DUST_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const rx = Math.cos(ang) * (0.95 + Math.random() * 0.45);
      const rz = Math.sin(ang) * (0.62 + Math.random() * 0.32);
      dustPositions[i * 3] = rx;
      dustPositions[i * 3 + 1] = 0.03 + Math.random() * 0.05;
      dustPositions[i * 3 + 2] = rz;

      const speed = 0.85 + Math.random() * 1.15;
      dustVel[i * 3] = Math.cos(ang) * speed;
      dustVel[i * 3 + 1] = 0.18 + Math.random() * 0.34;
      dustVel[i * 3 + 2] = Math.sin(ang) * speed * 0.72;
    }
    const dustPointsGeo = new THREE.BufferGeometry();
    dustPointsGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustPointsMat = new THREE.PointsMaterial({
      map: particleTex,
      color: '#C2B8AA',
      size: 0.25,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const dustPoints = new THREE.Points(dustPointsGeo, dustPointsMat);
    dustPoints.visible = false;
    scene.add(dustPoints);

    // Floating Golden Dust Motes emerging from inside the opened CS2 case
    const MOTE_COUNT = 52;
    const motePositions = new Float32Array(MOTE_COUNT * 3);
    const moteSeeds = new Float32Array(MOTE_COUNT * 2);
    for (let i = 0; i < MOTE_COUNT; i++) {
      motePositions[i * 3] = (Math.random() - 0.5) * 1.5;
      motePositions[i * 3 + 1] = 0.82 + Math.random() * 1.65;
      motePositions[i * 3 + 2] = (Math.random() - 0.5) * 1.0;
      moteSeeds[i * 2] = 0.38 + Math.random() * 0.58;
      moteSeeds[i * 2 + 1] = Math.random() * Math.PI * 2;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    const moteMat = new THREE.PointsMaterial({
      map: particleTex,
      color: '#FFD27A',
      size: 0.072,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const motePoints = new THREE.Points(moteGeo, moteMat);
    motePoints.visible = false;
    scene.add(motePoints);

    const rig = buildTacticalCaseGroup(caseBox, renderer.capabilities.getMaxAnisotropy());
    dustPoints.rotation.y = SETTLED_ROT_Y;
    motePoints.rotation.y = SETTLED_ROT_Y;

    // Start inside the upper camera frustum (y=1.65) so frame 1 is immediately visible
    rig.root.position.set(0, 1.65, 0);
    rig.root.rotation.set(-0.08, -0.5, 0.02);
    scene.add(rig.root);

    // Bright Golden-Orange Interior PointLight illuminating raised lid & cam latches
    const pointGlow = new THREE.PointLight('#FF981A', 0, 7.5, 1.7);
    pointGlow.position.set(0, 1.25, 0.18);
    scene.add(pointGlow);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    const onContextRestored = () => {
      setWebglUnavailable(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      applyResponsiveCameraFraming(w, h);
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animStart = 0;
    let lastTime = 0;
    let frameCount = 0;
    let thudPlayed = false;
    let latchPlayed = false;
    let impactTriggered = false;
    let currentRotY = reducedMotion ? SETTLED_ROT_Y : -0.5;
    let currentRotX = reducedMotion ? SETTLED_ROT_X : -0.08;
    let currentRotZ = reducedMotion ? 0 : 0.02;
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 16);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 4);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 16);
        }
      };
      frameId = window.setTimeout(poll, 4);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      // Frame 0 compiles shaders on first draw; start the physical drop timer at Frame 1
      if (frameCount <= 1) {
        animStart = now;
        lastTime = now;
      }
      frameCount++;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const t = (now - animStart) / 1000;

      // === 1. SOURCE 2 WEIGHTY DROP -> SOLID IMPACT -> MICRO-BOUNCE -> SETTLE COMPLETELY STILL ===
      if (reducedMotion) {
        rig.root.position.y = 0;
        shadowMat.opacity = 0.8;
        shadowPlane.scale.set(1, 1, 1);
      } else if (t < 0.24) {
        const p = t / 0.24;
        rig.root.position.y = 1.65 * (1 - p * p);
        shadowMat.opacity = 0.2 + 0.6 * (p * p);
        const s = 0.68 + 0.32 * p;
        shadowPlane.scale.set(s, s, 1);
      } else {
        if (!thudPlayed) {
          thudPlayed = true;
          soundFX.playCaseDropThud();
        }
        if (!impactTriggered) {
          impactTriggered = true;
          dustPoints.visible = true;
        }

        const after = t - 0.24;
        if (after < 0.24) {
          const bp = after / 0.24;
          const microBounceY = Math.sin(bp * Math.PI) * 0.085 * (1 - bp * 0.35);
          rig.root.position.y = microBounceY;
          shadowMat.opacity = 0.8 - microBounceY * 0.4;
          shadowPlane.scale.set(1 + microBounceY * 0.08, 1 + microBounceY * 0.08, 1);
        } else {
          rig.root.position.y = 0;
          shadowMat.opacity = 0.8;
          shadowPlane.scale.set(1, 1, 1);
        }

        if (after < 0.85) {
          const dp = after / 0.85;
          dustRingMat.opacity = (1 - dp) * (1 - dp) * 0.42;
          const ds = 0.9 + dp * 1.35;
          dustRing.scale.set(ds, ds, 1);

          const posAttr = dustPointsGeo.getAttribute('position') as THREE.BufferAttribute;
          const drag = Math.exp(-3.4 * dt);
          for (let i = 0; i < DUST_COUNT; i++) {
            dustPositions[i * 3] += dustVel[i * 3] * dt;
            dustPositions[i * 3 + 1] = Math.max(0.02, dustPositions[i * 3 + 1] + dustVel[i * 3 + 1] * dt);
            dustPositions[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
            dustVel[i * 3] *= drag;
            dustVel[i * 3 + 1] = dustVel[i * 3 + 1] * drag - 0.32 * dt;
            dustVel[i * 3 + 2] *= drag;
          }
          posAttr.needsUpdate = true;
          dustPointsMat.opacity = Math.sin(Math.min(1, dp * 2.5) * (Math.PI / 2)) * (1 - dp) * 0.48;
        } else {
          dustRingMat.opacity = 0;
          dustPointsMat.opacity = 0;
          dustPoints.visible = false;
        }
      }

      const targetRotY = pointerTiltRef.current.targetRotY;
      const targetRotX = pointerTiltRef.current.targetRotX;
      if (!reducedMotion && t < 0.52) {
        currentRotY = THREE.MathUtils.damp(currentRotY, targetRotY, 10, dt);
        currentRotX = THREE.MathUtils.damp(currentRotX, targetRotX, 11, dt);
        currentRotZ = THREE.MathUtils.damp(currentRotZ, 0, 12, dt);
      } else if (
        pointerTiltRef.current.dragging ||
        Math.abs(currentRotY - targetRotY) > 0.0005 ||
        Math.abs(currentRotX - targetRotX) > 0.0005
      ) {
        currentRotY = THREE.MathUtils.damp(currentRotY, targetRotY, 10, dt);
        currentRotX = THREE.MathUtils.damp(currentRotX, targetRotX, 10, dt);
        currentRotZ = 0;
      } else {
        currentRotY = targetRotY;
        currentRotX = targetRotX;
        currentRotZ = 0;
      }
      rig.root.rotation.set(currentRotX, currentRotY, currentRotZ);

      // === 2. 2-STAGE CS2 90° OPENING: LATCHES UNFASTEN -> 90° HINGE -> GOLDEN VOLUMETRIC RADIANCE ===
      const wantOpen = openingLidRef.current;
      if (wantOpen && !latchPlayed) {
        latchPlayed = true;
        soundFX.playCaseLidOpen();
      } else if (!wantOpen) {
        latchPlayed = false;
      }

      const openSec =
        wantOpen && openingStartedAtRef.current !== null
          ? Math.max(0, (now - openingStartedAtRef.current) / 1000)
          : 0;

      // Stage A (0.00s -> 0.22s): Twin heavy metal cam latches snap outward unfastening the lid
      const latchProgress = wantOpen ? easeOutCubic(openSec / 0.22) : 0;
      const latchAngle = wantOpen ? -1.48 * latchProgress : THREE.MathUtils.damp(rig.latches[0]?.rotation.x ?? 0, 0, 14, dt);
      rig.latches.forEach((l) => {
        l.rotation.x = latchAngle;
      });

      // Stage B (0.16s -> 1.04s): Heavy lid hinges smoothly to full 90 degrees (-Math.PI / 2)
      let lidAngle = 0;
      if (wantOpen) {
        if (openSec > 0.16) {
          const hp = Math.min(1, (openSec - 0.16) / 0.88);
          const settle = easeInOutCubic(hp) + Math.sin(Math.PI * hp) * 0.012;
          lidAngle = (-Math.PI / 2) * settle;
        }
      } else {
        lidAngle = THREE.MathUtils.damp(rig.lidPivot.rotation.x, 0, 12, dt);
      }
      rig.lidPivot.rotation.x = lidAngle;

      // Stage C: Bright Golden-Orange Interior Core + Volumetric Light Rays + Floating Dust Motes
      const lidOpenFraction = Math.min(1, Math.max(0, -rig.lidPivot.rotation.x / (Math.PI / 2)));
      const glowFactor = lidOpenFraction > 0.06 ? Math.pow((lidOpenFraction - 0.06) / 0.94, 0.7) : 0;

      rig.interiorGlowMat.opacity = glowFactor;
      rig.interiorRimMat.emissiveIntensity = glowFactor * 2.6;
      pointGlow.intensity = glowFactor * 7.2;

      rig.volumetricRays.forEach((entry, idx) => {
        if (glowFactor > 0.02) {
          entry.mesh.visible = true;
          const shimmer = 0.94 + Math.sin(t * 2.4 + idx * 1.1) * 0.06;
          entry.mat.opacity = glowFactor * (idx < 3 ? 0.44 : 0.3) * shimmer;
          entry.mesh.scale.set(1, 0.2 + glowFactor * 0.95, 1);
          entry.mesh.rotation.y = entry.baseRotY + Math.sin(t * 0.6 + idx) * 0.04;
        } else {
          entry.mesh.visible = false;
          entry.mat.opacity = 0;
        }
      });

      if (glowFactor > 0.04) {
        motePoints.visible = true;
        const mPosAttr = moteGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < MOTE_COUNT; i++) {
          motePositions[i * 3 + 1] += moteSeeds[i * 2] * dt;
          motePositions[i * 3] += Math.sin(t * 1.6 + moteSeeds[i * 2 + 1]) * 0.08 * dt;
          if (motePositions[i * 3 + 1] > 2.65) {
            motePositions[i * 3 + 1] = 0.82;
          }
        }
        mPosAttr.needsUpdate = true;
        moteMat.opacity = glowFactor * 0.85;
      } else {
        motePoints.visible = false;
        moteMat.opacity = 0;
      }

      // Camera stays 100% locked-off static
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      scene.remove(rig.root);
      rig.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      dustRingGeo.dispose();
      dustRingMat.dispose();
      dustRingTex.dispose();
      dustPointsGeo.dispose();
      dustPointsMat.dispose();
      moteGeo.dispose();
      moteMat.dispose();
      particleTex.dispose();
      envTarget.dispose();
      renderer.dispose();
    };
  }, [caseBox.id, caseBox.tier, caseBox.name, entryKey]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerTiltRef.current.dragging = true;
    pointerTiltRef.current.lastX = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerTiltRef.current.dragging) return;
    const dx = e.clientX - pointerTiltRef.current.lastX;
    pointerTiltRef.current.lastX = e.clientX;
    pointerTiltRef.current.targetRotY = THREE.MathUtils.clamp(
      pointerTiltRef.current.targetRotY + dx * 0.008,
      -1.15,
      0.55
    );
  };

  const handlePointerUp = () => {
    pointerTiltRef.current.dragging = false;
  };

  const handlePointerLeave = () => {
    pointerTiltRef.current.dragging = false;
    pointerTiltRef.current.targetRotY = SETTLED_ROT_Y;
    pointerTiltRef.current.targetRotX = SETTLED_ROT_X;
  };

  if (webglUnavailable) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <CaseThumbnail3D
          caseBox={caseBox}
          className="w-64 h-48 object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,0.75)] animate-card-pop"
        />
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      data-testid="case-stage-3d"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className="relative w-full h-full cursor-grab active:cursor-grabbing select-none"
      aria-label={`3D модель кейса ${caseBox.name}`}
    />
  );
};
