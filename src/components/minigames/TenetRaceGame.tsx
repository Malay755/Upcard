import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArrowLeft, ArrowRight, Flame, Heart, OctagonAlert, Play, RotateCcw, Trophy, Zap } from 'lucide-react';
import tenetRiderCover from '../../assets/images/tenet_rider_cover_1794862143521.jpg';
import type { MinigameEnergySlot } from '../../types';
import { detectSoftwareWebGL } from '../../utils/caseModel3D';
import { formatTC } from '../../utils/economics';
import { soundFX } from '../../utils/sound';
import {
  buildGoldCoinMesh,
  buildTenetT4Group,
  buildTrafficVehicle,
  type GoldCoinRig,
  type TrafficVehicleKind,
  type TrafficVehicleRig,
} from '../../utils/tenetCar3D';

interface TenetRaceGameProps {
  energy: MinigameEnergySlot;
  isAuthorized: boolean;
  onRequireAuth: () => void;
  onStart: () => Promise<{ sessionId: string; durationMs: number }>;
  onFinish: (
    sessionId: string,
    coinsCollected: number,
    distanceMeters: number,
    nearMisses: number,
    survived: boolean
  ) => Promise<{ reward: number; bestScore: number }>;
  onBack: () => void;
}

type GamePhase = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

interface ActiveTraffic {
  id: number;
  lane: number;
  z: number;
  speedWorld: number;
  rig: TrafficVehicleRig;
  overtaken: boolean;
  hit: boolean;
}

interface ActiveCoin {
  id: number;
  lane: number;
  z: number;
  rig: GoldCoinRig;
  collected: boolean;
}

const LANE_CENTERS = [-3.15, -1.05, 1.05, 3.15] as const;
const ROAD_WIDTH = 9.4;
const ROAD_SPAN_Z = 220;
const LAMP_PAIRS = 14;
const LAMP_SPACING = 16;

// Module-scope reusable scratch math helpers (Zero-GC render loop)
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

function createHighwayAsphaltTexture(anisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  // Dark textured asphalt
  ctx.fillStyle = '#181C24';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt aggregate noise
  for (let i = 0; i < 1600; i++) {
    const x = (i * 73) % 512;
    const y = (i * 197) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y, 2, 3);
  }

  // Solid outer shoulder lines (amber left & right)
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(14, 0, 8, 512);
  ctx.fillRect(490, 0, 8, 512);

  // Three dashed white/slate lane dividers separating 4 lanes
  ctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
  const dividers = [132, 256, 380];
  for (const dx of dividers) {
    ctx.fillRect(dx - 3, 28, 6, 176);
    ctx.fillRect(dx - 3, 284, 6, 176);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 16);
  tex.anisotropy = anisotropy;
  return tex;
}

export const TenetRaceGame: React.FC<TenetRaceGameProps> = ({
  energy,
  isAuthorized,
  onRequireAuth,
  onStart,
  onFinish,
  onBack,
}) => {
  const [phase, setPhase] = useState<GamePhase>('TITLE_MENU');
  const [hp, setHp] = useState(2);
  const [coins, setCoins] = useState(0);
  const [nearMisses, setNearMisses] = useState(0);
  const [distance, setDistance] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(110);
  const [timeLeftMs, setTimeLeftMs] = useState(25_000);
  const [nearMissBanner, setNearMissBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [finalReward, setFinalReward] = useState<number | null>(null);
  const [didSurvive, setDidSurvive] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const durationMsRef = useRef(25_000);
  const targetLaneRef = useRef<number>(1);
  const gasHeldRef = useRef(false);
  const brakeHeldRef = useRef(false);
  const finishingRef = useRef(false);
  const coinsRef = useRef(0);
  const nearMissesRef = useRef(0);
  const distanceRef = useRef(0);
  const hpRef = useRef(2);
  const bannerTimerRef = useRef<number | null>(null);
  const swipeStartXRef = useRef<number | null>(null);

  const moveLane = useCallback((delta: -1 | 1) => {
    if (finishingRef.current) return;
    const next = Math.max(0, Math.min(3, targetLaneRef.current + delta));
    if (next !== targetLaneRef.current) {
      targetLaneRef.current = next;
      soundFX.playCaseTick(0.22);
    }
  }, []);

  const triggerNearMissBanner = useCallback((comboCount: number) => {
    setNearMissBanner(`ОБГОН x${comboCount} +15 TC`);
    if (bannerTimerRef.current !== null) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setNearMissBanner(null), 950);
  }, []);

  const finishRace = useCallback(async (survived: boolean) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    gasHeldRef.current = false;
    brakeHeldRef.current = false;

    const sid = sessionIdRef.current;
    setDidSurvive(survived);
    setBusy(true);
    try {
      if (!sid) {
        setFinalReward(0);
        setPhase('ROUND_SUMMARY');
        return;
      }
      const res = await onFinish(
        sid,
        coinsRef.current,
        Math.round(distanceRef.current),
        nearMissesRef.current,
        survived
      );
      setFinalReward(res.reward);
      setPhase('ROUND_SUMMARY');
      if (survived || res.reward >= 200) {
        soundFX.playWheelWinFanfare(res.reward >= 380);
      } else {
        soundFX.playCoin();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось завершить заезд.');
      setFinalReward(0);
      setPhase('ROUND_SUMMARY');
    } finally {
      sessionIdRef.current = null;
      setBusy(false);
    }
  }, [onFinish]);

  const finishRaceRef = useRef(finishRace);
  finishRaceRef.current = finishRace;

  const startRace = async () => {
    if (!isAuthorized) {
      onRequireAuth();
      return;
    }
    if (energy.charges <= 0 || busy) return;
    setErrorMsg('');
    setBusy(true);
    try {
      const started = await onStart();
      sessionIdRef.current = started.sessionId;
      durationMsRef.current = Math.max(25_000, started.durationMs);
      targetLaneRef.current = 1;
      gasHeldRef.current = false;
      brakeHeldRef.current = false;
      finishingRef.current = false;
      coinsRef.current = 0;
      nearMissesRef.current = 0;
      distanceRef.current = 0;
      hpRef.current = 2;

      setHp(2);
      setCoins(0);
      setNearMisses(0);
      setDistance(0);
      setSpeedKmh(110);
      setNearMissBanner(null);
      setFinalReward(null);
      setTimeLeftMs(durationMsRef.current);
      setPhase('PLAYING');
      soundFX.playWheelStart();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось запустить заезд.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current !== null) window.clearTimeout(bannerTimerRef.current);
    };
  }, []);

  // Keyboard controls (WASD / Arrow keys + Russian layout keys) + blur safety release
  useEffect(() => {
    if (phase !== 'PLAYING') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a' || k === 'ф') {
        e.preventDefault();
        if (!e.repeat) moveLane(-1);
      } else if (k === 'arrowright' || k === 'd' || k === 'в') {
        e.preventDefault();
        if (!e.repeat) moveLane(1);
      } else if (k === 'arrowup' || k === 'w' || k === 'ц') {
        e.preventDefault();
        gasHeldRef.current = true;
      } else if (k === 'arrowdown' || k === 's' || k === 'ы') {
        e.preventDefault();
        brakeHeldRef.current = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w' || k === 'ц') {
        gasHeldRef.current = false;
      } else if (k === 'arrowdown' || k === 's' || k === 'ы') {
        brakeHeldRef.current = false;
      }
    };

    const resetHeld = () => {
      gasHeldRef.current = false;
      brakeHeldRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', resetHeld);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', resetHeld);
    };
  }, [phase, moveLane]);

  // Dedicated 3D Three.js Highway Renderer & Traffic Rider Physics Loop
  useEffect(() => {
    if (phase !== 'PLAYING') return;
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setErrorMsg('WebGL недоступен в текущем браузере.');
      return;
    }

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(240, container.clientHeight);
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.dataset.testid = 'tenet-race-canvas';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Night/Dusk city-highway atmosphere with matched horizon FogExp2
    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x090d16);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(0x090d16, 0.0115);

    const camera = new THREE.PerspectiveCamera(62, width / height, 0.2, 240);
    camera.position.set(LANE_CENTERS[1], 2.75, 5.8);
    camera.lookAt(LANE_CENTERS[1], 0.9, -18);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    // Warm/cool contrast lighting calibrated so metallic car paint never blows out
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f1219, 0.72);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffedd5, 1.75);
    keyLight.position.set(10, 18, 12);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 45;
      keyLight.shadow.camera.left = -12;
      keyLight.shadow.camera.right = 12;
      keyLight.shadow.camera.top = 18;
      keyLight.shadow.camera.bottom = -12;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.85);
    rimLight.position.set(-12, 8, -24);
    scene.add(rimLight);

    // Scrolling InstancedMesh city skyline silhouettes flanking highway for depth & speed parallax
    const TOWER_COUNT = 28;
    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x0f1522,
      roughness: 0.7,
      metalness: 0.25,
    });
    const towersInst = new THREE.InstancedMesh(towerGeo, towerMat, TOWER_COUNT);
    towersInst.frustumCulled = false;
    scene.add(towersInst);

    const towerWinGeo = new THREE.BoxGeometry(0.95, 0.22, 0.95);
    const towerWinMat = new THREE.MeshBasicMaterial({ color: 0xfde68a });
    const towerWinsInst = new THREE.InstancedMesh(towerWinGeo, towerWinMat, TOWER_COUNT);
    towerWinsInst.frustumCulled = false;
    scene.add(towerWinsInst);

    // Wide dark urban ground outside highway barriers
    const groundGeo = new THREE.PlaneGeometry(180, ROAD_SPAN_Z);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x070a10,
      roughness: 0.96,
      metalness: 0.02,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.03, -85);
    scene.add(ground);

    // Main 4-lane asphalt deck (offset +0.03 above terrain so zero Z-fighting)
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const roadTex = createHighwayAsphaltTexture(maxAniso);
    const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_SPAN_Z);
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.06,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(0, 0, -85);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    // Metallic concrete side barriers along highway edges
    const barrierGeo = new THREE.BoxGeometry(0.32, 0.58, ROAD_SPAN_Z);
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.72,
      metalness: 0.28,
    });
    const leftBarrier = new THREE.Mesh(barrierGeo, barrierMat);
    leftBarrier.position.set(-ROAD_WIDTH / 2 - 0.2, 0.29, -85);
    scene.add(leftBarrier);
    const rightBarrier = new THREE.Mesh(barrierGeo, barrierMat);
    rightBarrier.position.set(ROAD_WIDTH / 2 + 0.2, 0.29, -85);
    scene.add(rightBarrier);

    // InstancedMesh roadside streetlight poles & warm amber lamps (left & right)
    const totalLamps = LAMP_PAIRS * 2;
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.11, 5.2, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.35 });
    const polesInst = new THREE.InstancedMesh(poleGeo, poleMat, totalLamps);
    polesInst.frustumCulled = false;
    scene.add(polesInst);

    const bulbGeo = new THREE.BoxGeometry(0.65, 0.12, 0.28);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: new THREE.Color(0xfbbf24),
      emissiveIntensity: 2.2,
    });
    const bulbsInst = new THREE.InstancedMesh(bulbGeo, bulbMat, totalLamps);
    bulbsInst.frustumCulled = false;
    scene.add(bulbsInst);

    // Hero Player TENET T4 3D Vehicle
    const playerRig = buildTenetT4Group(maxAniso);
    playerRig.root.position.set(LANE_CENTERS[1], 0, 0);
    scene.add(playerRig.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Simulation state
    let disposed = false;
    let frameId = 0;
    let lastTime = performance.now();
    const simStart = performance.now();
    let hudSyncAt = 0;
    let currentX: number = LANE_CENTERS[1];
    let prevX: number = currentX;
    let currentSpeed = 30.5; // world units/sec (~110 km/h)
    let cameraTrauma = 0;
    let invulnUntil = 0;
    let spawnCooldown = 0.7;
    let coinCooldown = 0.9;
    let seq = 1;
    let lampTravel = 0;

    const trafficList: ActiveTraffic[] = [];
    const coinList: ActiveCoin[] = [];
    const trafficKinds: TrafficVehicleKind[] = ['sedan', 'taxi', 'suv', 'van'];

    const updateLamps = (offset: number) => {
      let idx = 0;
      const totalDepth = LAMP_PAIRS * LAMP_SPACING;
      for (let i = 0; i < LAMP_PAIRS; i++) {
        const z = -((i * LAMP_SPACING - offset + totalDepth * 10) % totalDepth) + 12;
        for (const side of [-1, 1]) {
          _pos.set(side * (ROAD_WIDTH / 2 + 0.68), 2.6, z);
          _quat.identity();
          _scale.set(1, 1, 1);
          _mat4.compose(_pos, _quat, _scale);
          polesInst.setMatrixAt(idx, _mat4);

          _pos.set(side * (ROAD_WIDTH / 2 + 0.35), 5.15, z);
          _mat4.compose(_pos, _quat, _scale);
          bulbsInst.setMatrixAt(idx, _mat4);
          idx++;
        }
      }
      polesInst.instanceMatrix.needsUpdate = true;
      bulbsInst.instanceMatrix.needsUpdate = true;

      // Scroll outer night city towers
      const towerDepth = 182;
      const towerStep = towerDepth / (TOWER_COUNT / 2);
      const towerOffset = (distanceRef.current * 0.85) % towerStep;
      let tIdx = 0;
      for (let i = 0; i < TOWER_COUNT / 2; i++) {
        const z = -((i * towerStep - towerOffset + towerDepth * 10) % towerDepth) + 10;
        for (const side of [-1, 1]) {
          const seed = (i * 7 + (side > 0 ? 3 : 1)) % 5;
          const h = 11 + seed * 4.5;
          const w = 4.6 + (seed % 3) * 1.4;
          const xPos = side * (ROAD_WIDTH / 2 + 7.5 + (seed % 3) * 2.8);
          _pos.set(xPos, h / 2 - 0.1, z);
          _quat.identity();
          _scale.set(w, h, w * 0.9);
          _mat4.compose(_pos, _quat, _scale);
          towersInst.setMatrixAt(tIdx, _mat4);

          _pos.set(xPos, h - 1.2, z);
          _scale.set(w * 1.01, 1, w * 0.91);
          _mat4.compose(_pos, _quat, _scale);
          towerWinsInst.setMatrixAt(tIdx, _mat4);
          tIdx++;
        }
      }
      towersInst.instanceMatrix.needsUpdate = true;
      towerWinsInst.instanceMatrix.needsUpdate = true;
    };
    updateLamps(0);

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 20);
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
          frameId = window.setTimeout(cb, 42);
        }
      };
      frameId = window.setTimeout(poll, 4);
    };

    const cleanupEntityLists = () => {
      for (const t of trafficList) {
        scene.remove(t.rig.root);
        t.rig.dispose();
      }
      trafficList.length = 0;
      for (const c of coinList) {
        scene.remove(c.rig.root);
        c.rig.dispose();
      }
      coinList.length = 0;
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const elapsed = now - simStart;
      const remaining = Math.max(0, durationMsRef.current - elapsed);

      // Speed control (Traffic Rider Gas vs Brake vs Cruise)
      const isGassing = gasHeldRef.current && !brakeHeldRef.current;
      const isBraking = brakeHeldRef.current;
      const targetSpeed = isBraking ? 17.5 : isGassing ? 51.5 : 31.0;
      currentSpeed = THREE.MathUtils.damp(currentSpeed, targetSpeed, isBraking ? 6.5 : 4.2, dt);

      const kmh = Math.round(currentSpeed * 3.6);
      const stepWorld = currentSpeed * dt;
      distanceRef.current += stepWorld;

      // Scroll asphalt texture + lamps seamlessly
      roadTex.offset.y = (roadTex.offset.y + stepWorld * 0.072) % 1;
      lampTravel = (lampTravel + stepWorld) % LAMP_SPACING;
      updateLamps(lampTravel);

      // Smooth damped lateral lane weaving + body lean & front wheel steer
      const targetX = LANE_CENTERS[targetLaneRef.current];
      prevX = currentX;
      currentX = THREE.MathUtils.damp(currentX, targetX, 13.5, dt);
      const lateralVel = (currentX - prevX) / dt;

      playerRig.root.position.x = currentX;
      playerRig.spinWheels(stepWorld);
      playerRig.setBraking(isBraking ? 1 : 0);
      playerRig.setNitro(isGassing ? 1 : 0);
      playerRig.setSteer(
        THREE.MathUtils.clamp(-lateralVel * 0.035, -0.32, 0.32),
        THREE.MathUtils.clamp(-lateralVel * 0.011, -0.09, 0.09),
        isBraking ? -0.032 : isGassing ? 0.022 : 0
      );

      // Invulnerability flicker after impact
      if (now < invulnUntil) {
        playerRig.root.visible = Math.floor(now / 75) % 2 === 0;
      } else {
        playerRig.root.visible = true;
      }

      // Camera smooth chase + speed FOV surge + trauma shake
      const targetFov = isBraking ? 56 : isGassing ? 76 : 63;
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5.5, dt);
      camera.updateProjectionMatrix();

      cameraTrauma = Math.max(0, cameraTrauma - dt * 1.9);
      const shakeMag = cameraTrauma * cameraTrauma * 0.38;
      const shakeX = (Math.sin(now * 0.043) + Math.cos(now * 0.071)) * 0.5 * shakeMag;
      const shakeY = Math.cos(now * 0.059) * 0.5 * shakeMag;

      camera.position.x = THREE.MathUtils.damp(camera.position.x, currentX * 0.72, 7.5, dt) + shakeX;
      camera.position.y = THREE.MathUtils.damp(camera.position.y, isGassing ? 2.52 : 2.75, 5, dt) + shakeY;
      camera.lookAt(currentX * 0.45, 0.92, -18);

      // Spawn Traffic Waves safely (always leave >= 1 passable lane; clear opening ~1.8s at start)
      spawnCooldown -= dt;
      if (spawnCooldown <= 0 && elapsed > 1200) {
        const waveCount = elapsed > 12000 && Math.random() < 0.45 ? 2 : 1;
        const usedLanes = new Set<number>();
        for (let w = 0; w < waveCount; w++) {
          const lane = Math.floor(Math.random() * 4);
          if (usedLanes.has(lane)) continue;
          // Ensure lane doesn't overlap an already nearby traffic car at spawn z
          const blockedNearby = trafficList.some((t) => t.lane === lane && t.z < -85);
          if (blockedNearby) continue;

          usedLanes.add(lane);
          const kind = trafficKinds[Math.floor(Math.random() * trafficKinds.length)];
          const rig = buildTrafficVehicle(kind);
          const spawnZ = -125 - w * (12 + Math.random() * 14);
          rig.root.position.set(LANE_CENTERS[lane], 0, spawnZ);
          scene.add(rig.root);

          const speedWorld = kind === 'van' ? 11.5 : kind === 'suv' ? 14.5 : 16.5;
          trafficList.push({
            id: seq++,
            lane,
            z: spawnZ,
            speedWorld,
            rig,
            overtaken: false,
            hit: false,
          });
        }
        const tempo = Math.min(1, elapsed / durationMsRef.current);
        spawnCooldown = THREE.MathUtils.lerp(1.05, 0.56, tempo) * (isGassing ? 0.78 : 1);
      }

      // Spawn Gold Coins along random open lane
      coinCooldown -= dt;
      if (coinCooldown <= 0) {
        const lane = Math.floor(Math.random() * 4);
        const coinRig = buildGoldCoinMesh(maxAniso);
        coinRig.root.position.set(LANE_CENTERS[lane], 0, -122);
        scene.add(coinRig.root);
        coinList.push({
          id: seq++,
          lane,
          z: -122,
          rig: coinRig,
          collected: false,
        });
        coinCooldown = 1.05 + Math.random() * 0.55;
      }

      // Update Traffic + Detect Collisions + Traffic Rider Close Overtake!
      for (let i = trafficList.length - 1; i >= 0; i--) {
        const t = trafficList[i];
        const relMove = (currentSpeed - t.speedWorld) * dt;
        t.z += relMove;
        t.rig.root.position.z = t.z;

        const wAngle = -(t.speedWorld * dt) / 0.3;
        for (const w of t.rig.wheels) w.rotation.x += wAngle;

        if (!t.hit) {
          const latDist = Math.abs(currentX - LANE_CENTERS[t.lane]);
          const zDist = Math.abs(t.z);
          if (latDist < 1.28 && zDist < 3.15) {
            t.hit = true;
            t.overtaken = true;
            if (now > invulnUntil) {
              hpRef.current -= 1;
              invulnUntil = now + 1150;
              cameraTrauma = 1.0;
              setHp(hpRef.current);
              soundFX.playMiniTrap();
              if (hpRef.current <= 0) {
                setDistance(Math.round(distanceRef.current));
                cleanupEntityLists();
                renderer.render(scene, camera);
                void finishRaceRef.current(false);
                return;
              }
            }
          } else if (!t.overtaken && t.z > 2.3) {
            t.overtaken = true;
            // Close overtake (same/adjacent lane gap at high speed) awards Near-Miss bonus!
            const latGap = Math.abs(currentX - LANE_CENTERS[t.lane]);
            if (latGap <= 2.45 && currentSpeed >= 27) {
              nearMissesRef.current += 1;
              setNearMisses(nearMissesRef.current);
              triggerNearMissBanner(nearMissesRef.current);
              soundFX.playMiniTap(nearMissesRef.current + 3);
            }
          }
        }

        if (t.z > 14) {
          scene.remove(t.rig.root);
          t.rig.dispose();
          trafficList.splice(i, 1);
        }
      }

      // Update & Collect Gold Coins
      for (let i = coinList.length - 1; i >= 0; i--) {
        const c = coinList[i];
        c.z += stepWorld;
        c.rig.root.position.z = c.z;
        c.rig.mesh.rotation.y += dt * 3.4;

        if (!c.collected) {
          const latDist = Math.abs(currentX - LANE_CENTERS[c.lane]);
          const zDist = Math.abs(c.z);
          if (latDist < 1.35 && zDist < 2.2) {
            c.collected = true;
            coinsRef.current += 1;
            setCoins(coinsRef.current);
            soundFX.playCoin();
            scene.remove(c.rig.root);
            c.rig.dispose();
            coinList.splice(i, 1);
            continue;
          }
        }

        if (c.z > 10) {
          scene.remove(c.rig.root);
          c.rig.dispose();
          coinList.splice(i, 1);
        }
      }

      if (now - hudSyncAt > 110) {
        hudSyncAt = now;
        setTimeLeftMs(remaining);
        setDistance(Math.round(distanceRef.current));
        setSpeedKmh(kmh);
      }

      if (remaining <= 0) {
        setTimeLeftMs(0);
        setDistance(Math.round(distanceRef.current));
        cleanupEntityLists();
        renderer.render(scene, camera);
        void finishRaceRef.current(true);
        return;
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      cleanupEntityLists();
      scene.remove(playerRig.root);
      playerRig.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      roadGeo.dispose();
      roadMat.dispose();
      roadTex.dispose();
      barrierGeo.dispose();
      barrierMat.dispose();
      poleGeo.dispose();
      poleMat.dispose();
      bulbGeo.dispose();
      bulbMat.dispose();
      towerGeo.dispose();
      towerMat.dispose();
      towerWinGeo.dispose();
      towerWinMat.dispose();
      envTarget.dispose();
      renderer.dispose();
    };
  }, [phase, triggerNearMissBanner]);

  const estimatedPreview = Math.min(
    600,
    coins * 20 + nearMisses * 15 + Math.min(90, Math.floor(distance / 14)) + 110
  );

  return (
    <div className="space-y-4 select-none" data-game-state={phase}>
      {/* Live Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#0D0F12] px-4 py-3 text-xs sm:text-sm">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 font-mono-num">
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">Таймер</span>
            <span className="font-bold text-white">{(timeLeftMs / 1000).toFixed(1)}с</span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">Монеты</span>
            <span className="font-bold text-[#FACC15]">{coins}</span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">Обгоны</span>
            <span className="font-bold text-cyan-300">{nearMisses}</span>
          </div>
          <div className="flex items-center gap-1" aria-label={`Броня ${hp} из 2`}>
            <span className="text-slate-400 mr-1">Броня</span>
            {[0, 1].map((idx) => (
              <Heart
                key={idx}
                className={`h-4 w-4 ${idx < hp ? 'fill-rose-500 text-rose-500' : 'text-slate-600'}`}
              />
            ))}
          </div>
        </div>
        <div className="text-xs font-mono-num text-slate-300">
          Сегодня {energy.charges}/{energy.maxCharges}
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {phase === 'TITLE_MENU' && (
        <div className="rounded-xl border border-white/[0.07] bg-[#0D0F12] p-5 text-center space-y-4">
          <div className="mx-auto relative h-36 w-60 overflow-hidden rounded-xl border border-amber-400/30 bg-[#161920] shadow-[0_0_28px_rgba(250,204,21,0.12)]">
            {!coverBroken ? (
              <img
                src={tenetRiderCover}
                alt="TENET T4 Traffic Rider"
                referrerPolicy="no-referrer"
                onError={() => setCoverBroken(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-display font-bold text-[#FACC15]">
                TENET T4
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display text-lg font-extrabold text-white">TENET T4 · Traffic Rider 3D</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Несись по 4-полосной ночной магистрали за рулём <span className="text-white font-semibold">3D TENET T4</span>! Жми <span className="text-cyan-300 font-semibold">Газ/Нитро</span>, тормози перед потоком, делай плотные <span className="text-[#FACC15] font-semibold">обгоны (+15 TC)</span> и собирай монеты (<span className="text-[#FACC15] font-semibold">+20 TC</span>). До <span className="font-mono-num text-white">600 TC</span> за заезд.
            </p>
            <p className="text-[11px] font-mono-num text-slate-500">
              A/D или ←/→ — полосы · W/↑ — Газ · S/↓ — Тормоз
            </p>
          </div>
          <button
            type="button"
            onClick={startRace}
            disabled={busy || (isAuthorized && energy.charges <= 0)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#FACC15] px-6 py-2.5 text-sm font-display font-bold text-[#0B0D10] hover:bg-[#FDE047] disabled:bg-[#232830] disabled:text-slate-500 transition-colors cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current" />
            <span>
              {!isAuthorized
                ? 'Войти и сесть за руль'
                : energy.charges <= 0
                ? 'Попытки на сегодня вышли'
                : busy
                ? 'Заводим мотор...'
                : 'Выехать на трассу (25с)'}
            </span>
          </button>
        </div>
      )}

      {phase === 'PLAYING' && (
        <div className="space-y-3">
          {/* Isolated WebGL viewport + solid/rgba corner HUD (no backdrop-filter over canvas) */}
          <div
            className="relative mx-auto w-full h-[300px] sm:h-[340px] overflow-hidden rounded-xl border border-white/10 bg-[#090B0E]"
            onPointerDown={(e) => {
              swipeStartXRef.current = e.clientX;
            }}
            onPointerUp={(e) => {
              const startX = swipeStartXRef.current;
              swipeStartXRef.current = null;
              if (startX !== null && Math.abs(e.clientX - startX) > 26) {
                moveLane(e.clientX - startX > 0 ? 1 : -1);
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              moveLane(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
            }}
          >
            <div ref={canvasMountRef} data-testid="tenet-race-canvas" className="w-full h-full" />

            {/* Top-left Digital Speedometer */}
            <div className="pointer-events-none absolute top-3 left-3 rounded-lg border border-white/10 bg-[#0B0D10]/85 px-3 py-1.5">
              <div className="font-mono-num text-xl sm:text-2xl font-black leading-none text-white">
                {speedKmh} <span className="text-[11px] font-bold text-[#FACC15]">КМ/Ч</span>
              </div>
              <div className="text-[10px] font-mono-num text-slate-400 mt-0.5">
                {distance} м · ~{estimatedPreview} TC
              </div>
            </div>

            {/* Top-right Near-Miss Callout */}
            {nearMissBanner && (
              <div className="pointer-events-none absolute top-3 right-3 rounded-lg border border-cyan-300/45 bg-cyan-950/90 px-3 py-1.5 font-display text-xs font-extrabold text-cyan-200 shadow-lg">
                <Zap className="inline h-3.5 w-3.5 mr-1 text-[#FACC15]" />
                {nearMissBanner}
              </div>
            )}
          </div>

          {/* Interactive Pedal & Lane Control Dock */}
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => moveLane(-1)}
              style={{ touchAction: 'manipulation' }}
              aria-label="Перестроиться влево"
              className="min-h-[48px] inline-flex items-center justify-center gap-1 rounded-xl border border-white/15 bg-[#181B22] hover:bg-[#222731] active:scale-95 text-xs sm:text-sm font-display font-bold text-white cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Влево</span>
            </button>

            <button
              type="button"
              onPointerDown={() => {
                gasHeldRef.current = true;
              }}
              onPointerUp={() => {
                gasHeldRef.current = false;
              }}
              onPointerLeave={() => {
                gasHeldRef.current = false;
              }}
              onPointerCancel={() => {
                gasHeldRef.current = false;
              }}
              style={{ touchAction: 'manipulation' }}
              className="min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 hover:bg-cyan-500/25 active:scale-95 text-xs sm:text-sm font-display font-bold text-cyan-200 cursor-pointer"
            >
              <Flame className="h-4 w-4 text-[#FACC15]" />
              <span>ГАЗ</span>
            </button>

            <button
              type="button"
              onPointerDown={() => {
                brakeHeldRef.current = true;
              }}
              onPointerUp={() => {
                brakeHeldRef.current = false;
              }}
              onPointerLeave={() => {
                brakeHeldRef.current = false;
              }}
              onPointerCancel={() => {
                brakeHeldRef.current = false;
              }}
              style={{ touchAction: 'manipulation' }}
              className="min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-400/35 bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 text-xs sm:text-sm font-display font-bold text-rose-200 cursor-pointer"
            >
              <OctagonAlert className="h-4 w-4" />
              <span>ТОРМОЗ</span>
            </button>

            <button
              type="button"
              onClick={() => moveLane(1)}
              style={{ touchAction: 'manipulation' }}
              aria-label="Перестроиться вправо"
              className="min-h-[48px] inline-flex items-center justify-center gap-1 rounded-xl border border-white/15 bg-[#181B22] hover:bg-[#222731] active:scale-95 text-xs sm:text-sm font-display font-bold text-white cursor-pointer"
            >
              <span className="hidden sm:inline">Вправо</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {phase === 'ROUND_SUMMARY' && (
        <div className="rounded-xl border border-white/[0.07] bg-[#0D0F12] p-6 text-center space-y-4">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#FACC15]/15 text-[#FACC15]">
            <Trophy className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-display font-bold">
              {didSurvive ? 'Финиш пройден!' : 'Авария на трассе! Частичная награда'}
            </p>
            <p className="font-mono-num text-3xl font-extrabold text-[#FACC15]">
              +{formatTC(finalReward ?? 0)} TC
            </p>
            <p className="text-xs text-slate-400 font-mono-num">
              Монет: {coins} · Обгонов: {nearMisses} · Дистанция: {distance} м
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {energy.charges > 0 && (
              <button
                type="button"
                onClick={startRace}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#FACC15] px-5 py-2.5 text-sm font-display font-bold text-[#0B0D10] hover:bg-[#FDE047] cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Ещё заезд ({energy.charges}/{energy.maxCharges})</span>
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-display font-bold text-white hover:bg-white/[0.12] cursor-pointer"
            >
              К выбору игр
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
