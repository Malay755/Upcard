import * as THREE from 'three';

export interface TenetT4Rig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  wheels: THREE.Group[];
  frontSteerPivots: THREE.Group[];
  nitroFlames: THREE.Mesh[];
  setBraking: (amount: number) => void;
  setNitro: (amount: number) => void;
  setSteer: (steerRad: number, rollRad: number, pitchRad: number) => void;
  spinWheels: (distanceDelta: number) => void;
  dispose: () => void;
}

export interface TrafficVehicleRig {
  root: THREE.Group;
  wheels: THREE.Mesh[];
  dispose: () => void;
}

export interface GoldCoinRig {
  root: THREE.Group;
  mesh: THREE.Group;
  dispose: () => void;
}

export type RoadHazardKind = 'oil' | 'spikes';

export interface RoadHazardRig {
  root: THREE.Group;
  kind: RoadHazardKind;
  dispose: () => void;
}

function createGrilleDiamondTexture(anisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#0A0D12';
  ctx.fillRect(0, 0, c.width, c.height);

  // Parametric TENET diamond studs radiating across dark grille mesh
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 18; col++) {
      const cx = 18 + col * 27 + (row % 2 === 0 ? 0 : 13.5);
      const cy = 22 + row * 28;
      const distCenter = Math.hypot((cx - 256) / 220, (cy - 128) / 100);
      if (distCenter > 1.05) continue;

      const grad = ctx.createLinearGradient(cx - 5, cy - 5, cx + 5, cy + 5);
      grad.addColorStop(0, '#F1F5F9');
      grad.addColorStop(0.5, '#94A3B8');
      grad.addColorStop(1, '#334155');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx + 6, cy);
      ctx.lineTo(cx, cy + 5);
      ctx.lineTo(cx - 6, cy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // TENET emblem plaque on upper center
  ctx.fillStyle = '#0F131A';
  ctx.fillRect(190, 42, 132, 34);
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2;
  ctx.strokeRect(190, 42, 132, 34);
  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 20px Outfit, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T E N E T', 256, 60);

  // T4 license plate below grille center
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(196, 168, 120, 42);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(196, 168, 120, 42);
  ctx.fillStyle = '#0F172A';
  ctx.font = '900 24px Outfit, system-ui, sans-serif';
  ctx.fillText('T', 245, 190);
  ctx.fillStyle = '#DC2626';
  ctx.fillText('4', 265, 190);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function createRearLightbarTexture(anisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;

  // Smoked black rear acrylic fascia
  ctx.fillStyle = '#090B10';
  ctx.fillRect(0, 0, c.width, c.height);

  // Outer smoked frame accent
  ctx.fillStyle = '#1E2430';
  ctx.fillRect(0, 12, c.width, 8);
  ctx.fillRect(0, 108, c.width, 8);

  // Continuous horizontal upper Crimson LED bar
  ctx.fillStyle = '#FF283C';
  ctx.fillRect(18, 30, c.width - 36, 9);

  // Signature TENET T4 outer zigzag / geometric LED segments on left & right clusters
  const drawCluster = (startX: number, dir: 1 | -1) => {
    ctx.fillStyle = '#FF1E38';
    for (let i = 0; i < 4; i++) {
      const x = startX + dir * i * 32;
      ctx.beginPath();
      ctx.moveTo(x, 48);
      ctx.lineTo(x + dir * 20, 48);
      ctx.lineTo(x + dir * 10, 74);
      ctx.lineTo(x - dir * 10, 74);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x - dir * 6, 79);
      ctx.lineTo(x + dir * 14, 79);
      ctx.lineTo(x + dir * 6, 96);
      ctx.lineTo(x - dir * 14, 96);
      ctx.closePath();
      ctx.fill();
    }
  };
  drawCluster(30, 1);
  drawCluster(482, -1);

  // Subtle brushed aluminum TENET wordmark centered inside dark fascia
  ctx.fillStyle = '#CBD5E1';
  ctx.font = 'bold 21px Outfit, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T  E  N  E  T', 256, 72);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function createAlloyWheelTexture(anisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const cx = 128;
  const cy = 128;

  ctx.fillStyle = '#0D1016';
  ctx.fillRect(0, 0, 256, 256);

  // Inner dark brake rotor & metallic hub depth
  ctx.fillStyle = '#1E2530';
  ctx.beginPath();
  ctx.arc(cx, cy, 108, 0, Math.PI * 2);
  ctx.fill();

  // Signature machined bi-color 5-twin-spoke pattern (visible in TENET T4 side & rear photos)
  for (let i = 0; i < 5; i++) {
    const baseAngle = (i / 5) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(baseAngle);

    const grad = ctx.createLinearGradient(-20, -110, 20, -25);
    grad.addColorStop(0, '#F8FAFC');
    grad.addColorStop(0.6, '#CBD5E1');
    grad.addColorStop(1, '#64748B');
    ctx.fillStyle = grad;

    // Twin sculpted spokes
    ctx.beginPath();
    ctx.moveTo(-14, -26);
    ctx.lineTo(-26, -104);
    ctx.lineTo(-10, -109);
    ctx.lineTo(-3, -28);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(14, -26);
    ctx.lineTo(26, -104);
    ctx.lineTo(10, -109);
    ctx.lineTo(3, -28);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // Outer machined lip ring
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, 112, 0, Math.PI * 2);
  ctx.stroke();

  // Center cap with chrome ring
  ctx.fillStyle = '#0F131A';
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 3;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function createCoinFaceTexture(anisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 110, 12, 128, 128, 122);
  grad.addColorStop(0, '#FEF08A');
  grad.addColorStop(0.6, '#FACC15');
  grad.addColorStop(1, '#B45309');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#FEF9C3';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 102, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#0B0D10';
  ctx.font = '900 116px Outfit, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T', 128, 134);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * Procedural 12+ part composite 3D hero model of the TENET T4 crossover SUV
 * built faithfully from the user's rear/front/side reference photos.
 * Oriented facing -Z (away from chase camera down the highway), bottom-center pivot at y = 0.
 */
export function buildTenetT4Group(anisotropy = 4): TenetT4Rig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Textures (color maps in SRGBColorSpace with max anisotropy)
  const grilleTex = createGrilleDiamondTexture(anisotropy);
  const rearBarTex = createRearLightbarTexture(anisotropy);
  const wheelRimTex = createAlloyWheelTexture(anisotropy);
  const shadowTex = createContactShadowTexture();
  textures.push(grilleTex, rearBarTex, wheelRimTex, shadowTex);

  // Materials calibrated for clear PBR contrast (>= 0.25 roughness spread)
  // Paint: Nardo Metallic Slate Grey (matches TENET T4 showroom & rear 3/4 photo)
  const paintMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x76808e,
      metalness: 0.72,
      roughness: 0.24,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    })
  );
  // Matte-black lower body cladding, wheel arches & rear diffuser (roughness 0.88)
  const claddingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x16191f,
      metalness: 0.08,
      roughness: 0.88,
    })
  );
  // Gloss black floating D-pillar / window surround trim
  const glossBlackMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b0e14,
      metalness: 0.35,
      roughness: 0.16,
      clearcoat: 0.9,
    })
  );
  // Smoked automotive glass
  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0f1724,
      metalness: 0.2,
      roughness: 0.08,
      clearcoat: 1.0,
    })
  );
  // Brushed silver door garnish & roof rail accent
  const brushedAluMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdbe3ee,
      metalness: 0.88,
      roughness: 0.24,
    })
  );
  const rubberTireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x121418,
      metalness: 0.04,
      roughness: 0.92,
    })
  );
  const wheelFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: wheelRimTex,
      color: 0xffffff,
      metalness: 0.55,
      roughness: 0.28,
    })
  );
  const grilleMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: grilleTex,
      color: 0xffffff,
      metalness: 0.5,
      roughness: 0.3,
    })
  );
  const rearBarMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: rearBarTex,
      emissiveMap: rearBarTex,
      color: 0xffffff,
      emissive: new THREE.Color(0xff2238),
      emissiveIntensity: 1.45,
      metalness: 0.25,
      roughness: 0.14,
    })
  );
  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: new THREE.Color(0xe0f2fe),
      emissiveIntensity: 2.4,
      roughness: 0.1,
    })
  );
  const reflectorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: new THREE.Color(0xef4444),
      emissiveIntensity: 0.7,
      roughness: 0.3,
    })
  );
  const plateRearMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.45,
      metalness: 0.1,
    })
  );
  const flameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    })
  );

  // Grounding contact shadow disc
  const shadowPlane = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.35, 4.4)), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, 0.02, 0);
  root.add(shadowPlane);

  // 1. Primary Silhouette: Extruded SUV crossover side profile (-Z = front, +Z = rear)
  // Coordinates in (z, y) rotated cleanly so profile spans along Z (-1.92 front -> +1.92 rear)
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-1.86, 0.30);
  hullShape.lineTo(-1.90, 0.68); // front bumper
  hullShape.lineTo(-1.76, 0.88); // hood tip
  hullShape.lineTo(-0.96, 0.98); // cowl / base of windshield
  hullShape.lineTo(-0.40, 1.44); // A-pillar -> roof front
  hullShape.lineTo(1.22, 1.42);  // flat roofline
  hullShape.lineTo(1.66, 1.38);  // rear spoiler lip
  hullShape.lineTo(1.78, 0.94);  // tailgate glass / rear lightbar ledge
  hullShape.lineTo(1.88, 0.62);  // tailgate face
  hullShape.lineTo(1.82, 0.32);  // lower rear bumper
  hullShape.closePath();

  const hullGeo = trackGeo(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 1.56,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 3,
      steps: 1,
    })
  );
  // Map extruded Z-depth centered at X=0, original X -> Z axis
  hullGeo.translate(0, 0, -0.78);
  hullGeo.rotateY(-Math.PI / 2);
  const hullMesh = new THREE.Mesh(hullGeo, paintMat);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  bodyGroup.add(hullMesh);

  // 2. Lower matte-black SUV cladding bumper + rocker skirts (contrasts glossy body)
  const lowerClad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.64, 0.24, 3.84)), claddingMat);
  lowerClad.position.set(0, 0.36, 0.02);
  lowerClad.castShadow = true;
  bodyGroup.add(lowerClad);

  // Silver lower door garnish strips (left/right, visible on side profile photo)
  const garnishGeo = trackGeo(new THREE.BoxGeometry(0.03, 0.065, 1.48));
  for (const side of [-1, 1]) {
    const garnish = new THREE.Mesh(garnishGeo, brushedAluMat);
    garnish.position.set(side * 0.84, 0.42, 0.02);
    bodyGroup.add(garnish);
  }

  // 3. Flared Wheel-Arch Cladding Rings (4 crossover arches)
  const archGeo = trackGeo(new THREE.TorusGeometry(0.39, 0.055, 10, 22, Math.PI));
  archGeo.rotateY(Math.PI / 2);
  const wheelZPositions = [-1.18, 1.18];
  for (const wz of wheelZPositions) {
    for (const side of [-1, 1]) {
      const arch = new THREE.Mesh(archGeo, claddingMat);
      arch.position.set(side * 0.81, 0.36, wz);
      bodyGroup.add(arch);
    }
  }

  // 4. Smoked Cabin Windows & Floating Black D-Pillar Trim
  const sideGlassGeo = trackGeo(new THREE.BoxGeometry(1.62, 0.34, 1.88));
  const sideGlass = new THREE.Mesh(sideGlassGeo, glassMat);
  sideGlass.position.set(0, 1.18, 0.32);
  bodyGroup.add(sideGlass);

  // Front windshield
  const windshield = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.42, 0.72)), glassMat);
  windshield.position.set(0, 1.19, -0.68);
  windshield.rotation.x = -0.78;
  bodyGroup.add(windshield);

  // Rear tailgate window + floating black D-pillar spoiler bezel (set clear of hull bevel)
  const rearGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.42, 0.34, 0.08)), glassMat);
  rearGlass.position.set(0, 1.18, 1.77);
  rearGlass.rotation.x = -0.32;
  bodyGroup.add(rearGlass);

  const dPillarTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.68, 0.24, 0.44)), glossBlackMat);
  dPillarTrim.position.set(0, 1.24, 1.46);
  bodyGroup.add(dPillarTrim);

  // 5. Roof Spoiler, Twin Roof Rails & Shark-Fin Antenna
  const spoiler = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.48, 0.07, 0.26)), paintMat);
  spoiler.position.set(0, 1.43, 1.66);
  spoiler.rotation.x = 0.08;
  bodyGroup.add(spoiler);

  const railGeo = trackGeo(new THREE.BoxGeometry(0.055, 0.045, 1.42));
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, glossBlackMat);
    rail.position.set(side * 0.56, 1.47, 0.42);
    bodyGroup.add(rail);
  }

  const finShape = new THREE.Shape();
  finShape.moveTo(-0.11, 0);
  finShape.lineTo(0.08, 0.09);
  finShape.lineTo(0.10, 0);
  finShape.closePath();
  const finGeo = trackGeo(new THREE.ExtrudeGeometry(finShape, { depth: 0.04, bevelEnabled: false }));
  finGeo.translate(0, 0, -0.02);
  finGeo.rotateY(-Math.PI / 2);
  const sharkFin = new THREE.Mesh(finGeo, paintMat);
  sharkFin.position.set(0, 1.45, 1.18);
  bodyGroup.add(sharkFin);

  // 6. Signature Full-Width TENET T4 Smoked Rear LED Lightbar + Rear Bumper Details
  const rearBarMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.64, 0.19, 0.09)), rearBarMat);
  rearBarMesh.position.set(0, 0.90, 1.90);
  bodyGroup.add(rearBarMesh);

  // Rear license recess & plate
  const plateMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.46, 0.14, 0.05)), plateRearMat);
  plateMesh.position.set(0, 0.68, 1.94);
  bodyGroup.add(plateMesh);

  // Vertical red bumper reflectors (signature rear 3/4 TENET T4 detail!)
  const reflectorGeo = trackGeo(new THREE.BoxGeometry(0.045, 0.18, 0.06));
  for (const side of [-1, 1]) {
    const ref = new THREE.Mesh(reflectorGeo, reflectorMat);
    ref.position.set(side * 0.72, 0.58, 1.92);
    bodyGroup.add(ref);
  }

  // Twin chrome exhaust tips
  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 12));
  exhaustGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(exhaustGeo, brushedAluMat);
    tip.position.set(side * 0.54, 0.25, 1.93);
    bodyGroup.add(tip);
  }

  // Twin additive nitro flames emerging from tips when holding Gas/Nitro
  const flameGeo = trackGeo(new THREE.ConeGeometry(0.075, 0.52, 10));
  flameGeo.rotateX(Math.PI / 2);
  const nitroFlames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(side * 0.54, 0.25, 2.22);
    flame.scale.set(0.7, 0.7, 0.1);
    bodyGroup.add(flame);
    nitroFlames.push(flame);
  }

  // 7. Front Octagonal Diamond Grille + Tri-LED Headlights (visible in traffic reflections & camera angles)
  const frontGrille = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.12, 0.44, 0.06)), grilleMat);
  frontGrille.position.set(0, 0.62, -1.91);
  bodyGroup.add(frontGrille);

  const headlampGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.10, 0.08));
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(headlampGeo, headlightMat);
    hl.position.set(side * 0.64, 0.78, -1.87);
    hl.rotation.y = side * -0.18;
    bodyGroup.add(hl);
  }

  // 8. Sculpted Side Mirrors
  const mirrorGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.10, 0.13));
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(mirrorGeo, glossBlackMat);
    mirror.position.set(side * 0.90, 1.02, -0.58);
    bodyGroup.add(mirror);
  }

  // 9. Four Rotating Wheels + Front Steer Pivots
  const tireGeo = trackGeo(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 22));
  tireGeo.rotateZ(Math.PI / 2);
  const capGeo = trackGeo(new THREE.CircleGeometry(0.25, 20));
  const wheels: THREE.Group[] = [];
  const frontSteerPivots: THREE.Group[] = [];

  for (let zi = 0; zi < wheelZPositions.length; zi++) {
    const wz = wheelZPositions[zi];
    const isFront = zi === 0;
    for (const side of [-1, 1]) {
      const steerPivot = new THREE.Group();
      steerPivot.position.set(side * 0.79, 0.33, wz);
      root.add(steerPivot);
      if (isFront) frontSteerPivots.push(steerPivot);

      const wheelSpinGroup = new THREE.Group();
      steerPivot.add(wheelSpinGroup);
      wheels.push(wheelSpinGroup);

      const tire = new THREE.Mesh(tireGeo, rubberTireMat);
      tire.castShadow = true;
      wheelSpinGroup.add(tire);

      const outerRim = new THREE.Mesh(capGeo, wheelFaceMat);
      outerRim.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      outerRim.position.x = side * 0.123;
      wheelSpinGroup.add(outerRim);
    }
  }

  const setBraking = (amount: number) => {
    const a = THREE.MathUtils.clamp(amount, 0, 1);
    rearBarMat.emissiveIntensity = 1.45 + a * 3.4;
    reflectorMat.emissiveIntensity = 0.7 + a * 1.9;
  };

  const setNitro = (amount: number) => {
    const a = THREE.MathUtils.clamp(amount, 0, 1);
    flameMat.opacity = a * 0.88;
    for (const flame of nitroFlames) {
      flame.visible = a > 0.04;
      flame.scale.set(0.8 + a * 0.4, 0.8 + a * 0.4, 0.2 + a * 1.15);
    }
  };

  const setSteer = (steerRad: number, rollRad: number, pitchRad: number) => {
    for (const pivot of frontSteerPivots) {
      pivot.rotation.y = steerRad;
    }
    bodyGroup.rotation.z = rollRad;
    bodyGroup.rotation.x = pitchRad;
  };

  const spinWheels = (distanceDelta: number) => {
    const angleDelta = -(distanceDelta / 0.33);
    for (const wheel of wheels) {
      wheel.rotation.x += angleDelta;
    }
  };

  const dispose = () => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
  };

  return {
    root,
    bodyGroup,
    wheels,
    frontSteerPivots,
    nitroFlames,
    setBraking,
    setNitro,
    setSteer,
    spinWheels,
    dispose,
  };
}

export type TrafficVehicleKind = 'sedan' | 'taxi' | 'suv' | 'van';

/**
 * Multi-part procedural traffic vehicles so the player weaves through recognizable
 * sedans, yellow Moscow taxis, dark SUVs, and box vans on the 4-lane highway.
 */
export function buildTrafficVehicle(kind: TrafficVehicleKind): TrafficVehicleRig {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const bodyColors: Record<TrafficVehicleKind, number> = {
    sedan: 0x3b82f6,
    taxi: 0xfacc15,
    suv: 0x334155,
    van: 0xe2e8f0,
  };

  const bodyMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: bodyColors[kind],
      metalness: kind === 'van' ? 0.2 : 0.45,
      roughness: kind === 'van' ? 0.42 : 0.25,
      clearcoat: kind === 'van' ? 0.35 : 0.85,
    })
  );
  const cabinGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.2,
      roughness: 0.14,
    })
  );
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.9,
      metalness: 0.05,
    })
  );
  const tailMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: new THREE.Color(0xef4444),
      emissiveIntensity: 1.5,
      roughness: 0.2,
    })
  );
  const trimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x181b22,
      roughness: 0.85,
      metalness: 0.08,
    })
  );

  const isVan = kind === 'van';
  const isSuv = kind === 'suv';
  const bodyLength = isVan ? 4.25 : isSuv ? 3.85 : 3.6;
  const bodyWidth = isVan ? 1.72 : 1.58;
  const hullH = isVan ? 1.48 : isSuv ? 0.64 : 0.52;

  // Lower hull
  const hull = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(bodyWidth, hullH, bodyLength)),
    bodyMat
  );
  hull.position.set(0, 0.3 + hullH / 2, 0);
  hull.castShadow = true;
  root.add(hull);

  // Bumpers
  const bumper = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(bodyWidth + 0.04, 0.18, bodyLength + 0.08)),
    trimMat
  );
  bumper.position.set(0, 0.31, 0);
  root.add(bumper);

  // Upper cabin / cab
  if (isVan) {
    const cabWindshield = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bodyWidth - 0.14, 0.44, 0.1)),
      cabinGlassMat
    );
    cabWindshield.position.set(0, 1.38, -bodyLength / 2 + 0.12);
    root.add(cabWindshield);
  } else {
    const cabH = isSuv ? 0.48 : 0.40;
    const cabLen = isSuv ? 2.15 : 1.78;
    const cab = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bodyWidth - 0.18, cabH, cabLen)),
      cabinGlassMat
    );
    cab.position.set(0, 0.3 + hullH + cabH / 2 - 0.02, 0.18);
    root.add(cab);

    const roof = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bodyWidth - 0.22, 0.06, cabLen - 0.14)),
      bodyMat
    );
    roof.position.set(0, 0.3 + hullH + cabH - 0.02, 0.18);
    root.add(roof);

    if (kind === 'taxi') {
      const signMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: new THREE.Color(0xfacc15),
          emissiveIntensity: 1.4,
        })
      );
      const sign = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.12, 0.2)), signMat);
      sign.position.set(0, 0.3 + hullH + cabH + 0.05, 0.05);
      root.add(sign);
    }
  }

  // Rear taillights (+Z faces player)
  const tailGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.12, 0.06));
  for (const side of [-1, 1]) {
    const tl = new THREE.Mesh(tailGeo, tailMat);
    tl.position.set(side * (bodyWidth * 0.34), isVan ? 0.72 : 0.76, bodyLength / 2 + 0.03);
    root.add(tl);
  }

  // Wheels
  const wheelGeo = trackGeo(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14));
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels: THREE.Mesh[] = [];
  const wzs = [-bodyLength * 0.32, bodyLength * 0.32];
  for (const wz of wzs) {
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, tireMat);
      w.position.set(side * (bodyWidth / 2 - 0.02), 0.3, wz);
      root.add(w);
      wheels.push(w);
    }
  }

  return {
    root,
    wheels,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

export function buildGoldCoinMesh(anisotropy = 4): GoldCoinRig {
  const root = new THREE.Group();
  const mesh = new THREE.Group();
  root.add(mesh);

  const tex = createCoinFaceTexture(anisotropy);
  const rimGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.11, 22);
  rimGeo.rotateX(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: new THREE.Color(0xca8a04),
    emissiveIntensity: 0.45,
    metalness: 0.85,
    roughness: 0.18,
  });

  const faceGeo = new THREE.CircleGeometry(0.43, 22);
  const faceMat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    emissive: new THREE.Color(0x854d0e),
    emissiveIntensity: 0.32,
    metalness: 0.5,
    roughness: 0.22,
  });

  const disc = new THREE.Mesh(rimGeo, rimMat);
  mesh.add(disc);

  const frontFace = new THREE.Mesh(faceGeo, faceMat);
  frontFace.position.z = 0.058;
  mesh.add(frontFace);

  const backFace = new THREE.Mesh(faceGeo, faceMat);
  backFace.position.z = -0.058;
  backFace.rotation.y = Math.PI;
  mesh.add(backFace);

  mesh.position.y = 0.72;

  return {
    root,
    mesh,
    dispose: () => {
      rimGeo.dispose();
      faceGeo.dispose();
      rimMat.dispose();
      faceMat.dispose();
      tex.dispose();
    },
  };
}

function createSpikeWarningTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.fillStyle = '#F59E0B';
  for (let x = -32; x < 300; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 18, 0);
    ctx.lineTo(x + 4, 64);
    ctx.lineTo(x - 14, 64);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRoadHazardMesh(kind: RoadHazardKind): RoadHazardRig {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  if (kind === 'oil') {
    // Glossy iridescent dark oil slick spread cleanly over asphalt (y = 0.018 + polygonOffset)
    const oilMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x050811,
        emissive: new THREE.Color(0x1e1b4b),
        emissiveIntensity: 0.28,
        metalness: 0.42,
        roughness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    const sheenMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x7e22ce,
        transparent: true,
        opacity: 0.48,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      })
    );
    const edgeGlowMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.42,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      })
    );

    const mainDisc = trackGeo(new THREE.CircleGeometry(0.84, 24));
    mainDisc.rotateX(-Math.PI / 2);
    const mainLobe = new THREE.Mesh(mainDisc, oilMat);
    mainLobe.scale.set(1.06, 1, 1.32);
    mainLobe.position.set(0, 0.02, 0);
    root.add(mainLobe);

    const sideDisc = trackGeo(new THREE.CircleGeometry(0.52, 18));
    sideDisc.rotateX(-Math.PI / 2);
    const lobeA = new THREE.Mesh(sideDisc, oilMat);
    lobeA.scale.set(1.15, 1, 0.88);
    lobeA.position.set(-0.42, 0.02, 0.36);
    root.add(lobeA);

    const lobeB = new THREE.Mesh(sideDisc, oilMat);
    lobeB.scale.set(0.92, 1, 1.18);
    lobeB.position.set(0.45, 0.02, -0.34);
    root.add(lobeB);

    const ringInnerGeo = trackGeo(new THREE.RingGeometry(0.56, 0.72, 24));
    ringInnerGeo.rotateX(-Math.PI / 2);
    const sheen = new THREE.Mesh(ringInnerGeo, sheenMat);
    sheen.scale.set(1.02, 1, 1.24);
    sheen.position.set(0, 0.024, 0);
    root.add(sheen);

    const ringOuterGeo = trackGeo(new THREE.RingGeometry(0.75, 0.85, 24));
    ringOuterGeo.rotateX(-Math.PI / 2);
    const edge = new THREE.Mesh(ringOuterGeo, edgeGlowMat);
    edge.scale.set(1.05, 1, 1.3);
    edge.position.set(0, 0.024, 0);
    root.add(edge);
  } else {
    // High-contrast road spike strip with chrome pyramidal caltrops & crimson warning caps
    const warnTex = createSpikeWarningTexture();
    textures.push(warnTex);

    const baseMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: warnTex,
        roughness: 0.45,
        metalness: 0.3,
      })
    );
    const steelMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        emissive: new THREE.Color(0x334155),
        emissiveIntensity: 0.2,
        metalness: 0.92,
        roughness: 0.16,
      })
    );
    const capMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: new THREE.Color(0xdc2626),
        emissiveIntensity: 1.4,
        roughness: 0.25,
      })
    );

    const barGeo = trackGeo(new THREE.BoxGeometry(1.76, 0.075, 0.36));
    const bar = new THREE.Mesh(barGeo, baseMat);
    bar.position.set(0, 0.038, 0);
    root.add(bar);

    const capGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.12, 0.42));
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(side * 0.89, 0.06, 0);
      root.add(cap);
    }

    const coneGeo = trackGeo(new THREE.ConeGeometry(0.085, 0.26, 4));
    coneGeo.rotateY(Math.PI / 4);
    for (let i = 0; i < 6; i++) {
      const x = -0.68 + i * 0.272;
      const spike = new THREE.Mesh(coneGeo, steelMat);
      spike.position.set(x, 0.20, 0);
      root.add(spike);
    }
  }

  return {
    root,
    kind,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}

