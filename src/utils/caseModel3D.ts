import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CaseBox, Rarity } from '../types';

export type CaseCrestType = 'leaf' | 'crown' | 'blade' | 'bolt' | 'chevron' | 'shield' | 'diamond';

export interface CaseTheme3D {
  id: string;
  bodyColor: string;
  lidColor: string;
  bumperColor: string;
  hardwareColor: string;
  accentColor: string;
  glowColor: string;
  crest: CaseCrestType;
  labelTag: string;
  serialCode: string;
}

export interface VolumetricRayEntry {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  baseScaleY: number;
  baseRotY: number;
}

export interface TacticalCaseRig {
  root: THREE.Group;
  lidPivot: THREE.Group;
  latches: THREE.Group[];
  interiorGlowMat: THREE.MeshBasicMaterial;
  interiorRimMat: THREE.MeshStandardMaterial;
  volumetricRays: VolumetricRayEntry[];
  theme: CaseTheme3D;
  dispose: () => void;
}

/**
 * CS2 Kilowatt / Revolution / Classic Tactical Weapon Case palette presets:
 * All share authentic dark charcoal/obsidian molded polymer housings with
 * signature CS2 stenciled stripes, brushed hardware, and tactical color accents.
 */
const PRESET_THEMES: Record<string, CaseTheme3D> = {
  case_starter: {
    id: 'starter',
    bodyColor: '#20242B',
    lidColor: '#191D23',
    bumperColor: '#0E1014',
    hardwareColor: '#9AA5B4',
    accentColor: '#14B8A6',
    glowColor: '#FF981A',
    crest: 'chevron',
    labelTag: 'CS2 // STARTER',
    serialCode: 'MK-01 // TACTICAL',
  },
  case_jade: {
    id: 'jade',
    bodyColor: '#1B2522',
    lidColor: '#141D1A',
    bumperColor: '#0C1110',
    hardwareColor: '#C5A059',
    accentColor: '#10B981',
    glowColor: '#FF981A',
    crest: 'blade',
    labelTag: 'CS2 // EMERALD',
    serialCode: 'OPS-04 // ARSENAL',
  },
  case_neon: {
    id: 'neon',
    bodyColor: '#1D212B',
    lidColor: '#161922',
    bumperColor: '#0D0F14',
    hardwareColor: '#CBD5E1',
    accentColor: '#D946EF',
    glowColor: '#FF981A',
    crest: 'bolt',
    labelTag: 'REVOLUTION // 2',
    serialCode: 'REV-09 // CYBER',
  },
  case_cyber: {
    id: 'crimson_oni',
    bodyColor: '#261D20',
    lidColor: '#1D1518',
    bumperColor: '#100B0D',
    hardwareColor: '#D4A853',
    accentColor: '#EF4444',
    glowColor: '#FF981A',
    crest: 'leaf',
    labelTag: 'ONI // CRIMSON',
    serialCode: 'CS-77 // WEB-OPS',
  },
  case_drip_legend: {
    id: 'drip_legend',
    bodyColor: '#1B1D22',
    lidColor: '#13151A',
    bumperColor: '#090A0D',
    hardwareColor: '#EAB308',
    accentColor: '#FACC15',
    glowColor: '#FFA41B',
    crest: 'crown',
    labelTag: 'KILOWATT // VIP',
    serialCode: 'KW-99 // CLASSIFIED',
  },
  case_custom_glock: {
    id: 'tactical_pro',
    bodyColor: '#22262E',
    lidColor: '#191D24',
    bumperColor: '#0E1014',
    hardwareColor: '#A1A1AA',
    accentColor: '#38BDF8',
    glowColor: '#FF981A',
    crest: 'shield',
    labelTag: 'ARMORY // SPEC',
    serialCode: 'SP-12 // COBALT',
  },
  case_custom_shadow: {
    id: 'shadow_drop',
    bodyColor: '#201D28',
    lidColor: '#17151E',
    bumperColor: '#0C0B10',
    hardwareColor: '#B8A6D9',
    accentColor: '#A855F7',
    glowColor: '#FF981A',
    crest: 'diamond',
    labelTag: 'PHANTOM // CS2',
    serialCode: 'PH-07 // SHADOW',
  },
  case_custom_katana: {
    id: 'samurai',
    bodyColor: '#251D1F',
    lidColor: '#1B1517',
    bumperColor: '#0E0B0C',
    hardwareColor: '#D9A74A',
    accentColor: '#F59E0B',
    glowColor: '#FF981A',
    crest: 'blade',
    labelTag: 'RONIN // CASE',
    serialCode: 'RN-05 // FORGED',
  },
  case_custom_dragon: {
    id: 'dragon',
    bodyColor: '#241E1C',
    lidColor: '#1A1513',
    bumperColor: '#0E0B0A',
    hardwareColor: '#FACC15',
    accentColor: '#FACC15',
    glowColor: '#FFA41B',
    crest: 'crown',
    labelTag: 'COVERT // GOLD',
    serialCode: 'DG-88 // ELITE',
  },
};

const FALLBACK_POOL_BY_TIER: Record<Rarity, Omit<CaseTheme3D, 'id' | 'labelTag' | 'serialCode'>[]> = {
  common: [
    {
      bodyColor: '#20252C',
      lidColor: '#181C22',
      bumperColor: '#0D0F13',
      hardwareColor: '#9CA3AF',
      accentColor: '#38BDF8',
      glowColor: '#FF981A',
      crest: 'shield',
    },
    {
      bodyColor: '#23272D',
      lidColor: '#1A1D23',
      bumperColor: '#0E1014',
      hardwareColor: '#94A3B8',
      accentColor: '#2DD4BF',
      glowColor: '#FF981A',
      crest: 'chevron',
    },
  ],
  rare: [
    {
      bodyColor: '#1D2421',
      lidColor: '#151B19',
      bumperColor: '#0B0F0E',
      hardwareColor: '#A8B5A0',
      accentColor: '#84CC16',
      glowColor: '#FF981A',
      crest: 'bolt',
    },
    {
      bodyColor: '#1C222B',
      lidColor: '#141921',
      bumperColor: '#0B0D13',
      hardwareColor: '#94A3B8',
      accentColor: '#0EA5E9',
      glowColor: '#FF981A',
      crest: 'diamond',
    },
  ],
  epic: [
    {
      bodyColor: '#231D27',
      lidColor: '#19141D',
      bumperColor: '#0E0B11',
      hardwareColor: '#C4B5FD',
      accentColor: '#EC4899',
      glowColor: '#FF981A',
      crest: 'diamond',
    },
    {
      bodyColor: '#261D20',
      lidColor: '#1C1517',
      bumperColor: '#0E0A0C',
      hardwareColor: '#D4A853',
      accentColor: '#F59E0B',
      glowColor: '#FF981A',
      crest: 'leaf',
    },
  ],
  legendary: [
    {
      bodyColor: '#211F1B',
      lidColor: '#171612',
      bumperColor: '#0B0A08',
      hardwareColor: '#FACC15',
      accentColor: '#FACC15',
      glowColor: '#FFA41B',
      crest: 'crown',
    },
    {
      bodyColor: '#1B1D22',
      lidColor: '#121418',
      bumperColor: '#090A0D',
      hardwareColor: '#EAB308',
      accentColor: '#F59E0B',
      glowColor: '#FFA41B',
      crest: 'crown',
    },
  ],
};

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveCaseTheme3D(caseBox: Pick<CaseBox, 'id' | 'name' | 'tier'>): CaseTheme3D {
  if (PRESET_THEMES[caseBox.id]) {
    return PRESET_THEMES[caseBox.id];
  }
  const h = hashString(caseBox.id + caseBox.name);
  const pool = FALLBACK_POOL_BY_TIER[caseBox.tier] ?? FALLBACK_POOL_BY_TIER.rare;
  const variant = pool[h % pool.length];
  return {
    id: caseBox.id,
    ...variant,
    labelTag: 'CS2 // WEAPON CASE',
    serialCode: `WC-${String(h % 90 + 10)} // SERIES`,
  };
}

let cachedIsSoftwareGl: boolean | null = null;
export function detectSoftwareWebGL(): boolean {
  if (cachedIsSoftwareGl !== null) return cachedIsSoftwareGl;
  if (typeof document === 'undefined') {
    cachedIsSoftwareGl = true;
    return true;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      cachedIsSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedIsSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    cachedIsSoftwareGl = true;
  }
  return cachedIsSoftwareGl;
}

/**
 * Procedural PBR maps for Blender-Cycles-quality CS2 molded polymer shell:
 * - Albedo map (SRGB): dark tactical composite + edge wear dust + fine surface scuffs + stencil stripes
 * - Roughness map (NoColorSpace): stippled matte casing (0.48-0.68) with glossy oil smudges & edge polish (0.28-0.42)
 * - Bump map (NoColorSpace): micro-pebble grain + directional micro-scratches
 */
function createCS2PolymerTextures(
  baseHex: string,
  accentHex: string,
  seedStr: string,
  anisotropy: number
): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = detectSoftwareWebGL() ? 256 : 512;
  const rand = mulberry32(hashString(seedStr));

  // 1. Albedo Texture (SRGB)
  const albedoC = document.createElement('canvas');
  albedoC.width = size;
  albedoC.height = size;
  const aCtx = albedoC.getContext('2d')!;
  aCtx.fillStyle = baseHex;
  aCtx.fillRect(0, 0, size, size);

  // Subtle grime & vignette shading
  const rad = aCtx.createRadialGradient(size * 0.5, size * 0.5, size * 0.1, size * 0.5, size * 0.5, size * 0.72);
  rad.addColorStop(0, 'rgba(255,255,255,0.035)');
  rad.addColorStop(1, 'rgba(0,0,0,0.22)');
  aCtx.fillStyle = rad;
  aCtx.fillRect(0, 0, size, size);

  // Subtle matte surface wear spots & edge scuffs
  for (let i = 0; i < 42; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 8 + rand() * 32;
    const g = aCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rand() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.09)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    aCtx.fillStyle = g;
    aCtx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fine tactical surface scratches
  aCtx.lineCap = 'round';
  for (let i = 0; i < 95; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 8 + rand() * 34;
    const ang = (rand() - 0.5) * 0.9;
    aCtx.strokeStyle =
      rand() > 0.35 ? `rgba(185, 195, 210, ${0.03 + rand() * 0.06})` : `rgba(0, 0, 0, ${0.09 + rand() * 0.1})`;
    aCtx.lineWidth = 0.6 + rand() * 1.1;
    aCtx.beginPath();
    aCtx.moveTo(x, y);
    aCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    aCtx.stroke();
  }

  // Faint accent wear streak
  aCtx.strokeStyle = accentHex;
  aCtx.globalAlpha = 0.06;
  aCtx.lineWidth = 2;
  aCtx.strokeRect(12, 12, size - 24, size - 24);
  aCtx.globalAlpha = 1;

  // 2. Roughness Texture (NoColorSpace — G channel controls roughness 0..255)
  const roughC = document.createElement('canvas');
  roughC.width = size;
  roughC.height = size;
  const rCtx = roughC.getContext('2d')!;
  rCtx.fillStyle = 'rgb(142, 142, 142)'; // ~0.55 base satin molded polymer
  rCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 65; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 12 + rand() * 44;
    const v = rand() > 0.5 ? 105 : 178; // Finger smudges (glossy 0.41) vs matte chalky patches (0.70)
    const g = rCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
    g.addColorStop(1, 'rgba(142,142,142,0)');
    rCtx.fillStyle = g;
    rCtx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Polished micro-scratches in roughness map so grazing light catches them realistically
  for (let i = 0; i < 110; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 10 + rand() * 38;
    const ang = (rand() - 0.5) * 1.1;
    rCtx.strokeStyle = rand() > 0.4 ? 'rgba(72, 72, 72, 0.55)' : 'rgba(200, 200, 200, 0.35)';
    rCtx.lineWidth = 0.8 + rand() * 1.0;
    rCtx.beginPath();
    rCtx.moveTo(x, y);
    rCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    rCtx.stroke();
  }

  // 3. Bump Texture (NoColorSpace — tactical stipple pebble + engraved scratches)
  const bumpC = document.createElement('canvas');
  bumpC.width = 256;
  bumpC.height = 256;
  const bCtx = bumpC.getContext('2d')!;
  const img = bCtx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 114 + Math.floor(rand() * 28);
    img.data[i] = n;
    img.data[i + 1] = n;
    img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  bCtx.putImageData(img, 0, 0);

  for (let i = 0; i < 55; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const len = 6 + rand() * 22;
    const ang = (rand() - 0.5) * 1.4;
    bCtx.strokeStyle = 'rgba(75, 75, 75, 0.45)';
    bCtx.lineWidth = 0.8;
    bCtx.beginPath();
    bCtx.moveTo(x, y);
    bCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    bCtx.stroke();
  }

  const map = new THREE.CanvasTexture(albedoC);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = anisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughC);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = anisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpC);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2.5, 2.5);

  return { map, roughnessMap, bumpMap };
}

/**
 * Generates an authentic CS2 Kilowatt / Revolution tactical front decal & stencil plate
 */
function createCS2DecalPlateTexture(theme: CaseTheme3D, anisotropy = 4): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext('2d')!;

  // Dark anodized gunmetal base plate
  ctx.fillStyle = '#0D0F13';
  ctx.fillRect(0, 0, c.width, c.height);

  // Subtle brushed metal horizontal streaks
  for (let y = 0; y < c.height; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, y, c.width, 1.5);
  }

  // CS2 diagonal hazard / Kilowatt tactical warning bars on left edge
  ctx.save();
  ctx.beginPath();
  ctx.rect(14, 14, 72, c.height - 28);
  ctx.clip();
  ctx.fillStyle = theme.accentColor;
  for (let x = -40; x < 120; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, c.height);
    ctx.lineTo(x + 11, c.height);
    ctx.lineTo(x + 48, 0);
    ctx.lineTo(x + 37, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Outer machined border & inner tactical frame
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16);

  // Small technical label header
  ctx.fillStyle = 'rgba(203, 213, 225, 0.72)';
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(theme.serialCode, 102, 50);

  // Bold stenciled case title badge
  ctx.fillStyle = theme.hardwareColor;
  ctx.font = '800 40px "Outfit", system-ui, sans-serif';
  ctx.fillText(theme.labelTag, 102, 106);

  // Micro barcode / serial block at bottom
  ctx.fillStyle = theme.accentColor;
  ctx.fillRect(102, 144, 90, 6);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
  for (let i = 0; i < 16; i++) {
    const bw = i % 3 === 0 ? 5 : 2;
    ctx.fillRect(204 + i * 9, 141, bw, 11);
  }

  // Brushed hex rivets at 4 corners
  [
    [22, 22],
    [c.width - 22, 22],
    [22, c.height - 22],
    [c.width - 22, c.height - 22],
  ].forEach(([bx, by]) => {
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(bx, by, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/**
 * Generates an egg-crate / tactical die-cut weapon charcoal foam normal/albedo texture for open interior
 */
function createTacticalFoamTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#14161B';
  ctx.fillRect(0, 0, size, size);

  const cell = 16;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const grad = ctx.createRadialGradient(
        x + cell / 2,
        y + cell / 2,
        1,
        x + cell / 2,
        y + cell / 2,
        cell * 0.65
      );
      grad.addColorStop(0, '#232730');
      grad.addColorStop(1, '#0D0E12');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, cell, cell);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

/**
 * Soft additive vertical fade texture for volumetric light rays radiating from opened CS2 case
 */
function createVolumetricRayTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  const vertGrad = ctx.createLinearGradient(0, h, 0, 0);
  vertGrad.addColorStop(0.0, 'rgba(255, 224, 140, 0.92)');
  vertGrad.addColorStop(0.18, 'rgba(255, 162, 36, 0.62)');
  vertGrad.addColorStop(0.55, 'rgba(245, 130, 20, 0.22)');
  vertGrad.addColorStop(1.0, 'rgba(245, 120, 10, 0.0)');
  ctx.fillStyle = vertGrad;
  ctx.fillRect(0, 0, w, h);

  // Horizontal Gaussian soft mask so beam edges never look polygonal
  ctx.globalCompositeOperation = 'destination-in';
  const horizGrad = ctx.createLinearGradient(0, 0, w, 0);
  horizGrad.addColorStop(0.0, 'rgba(0,0,0,0)');
  horizGrad.addColorStop(0.25, 'rgba(0,0,0,0.65)');
  horizGrad.addColorStop(0.5, 'rgba(0,0,0,1)');
  horizGrad.addColorStop(0.75, 'rgba(0,0,0,0.65)');
  horizGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = horizGrad;
  ctx.fillRect(0, 0, w, h);

  return new THREE.CanvasTexture(c);
}

function createCrestGeometry(crest: CaseCrestType): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();

  if (crest === 'leaf') {
    shape.moveTo(0, 0.24);
    shape.lineTo(0.05, 0.1);
    shape.lineTo(0.19, 0.16);
    shape.lineTo(0.12, 0.03);
    shape.lineTo(0.24, -0.02);
    shape.lineTo(0.09, -0.08);
    shape.lineTo(0.14, -0.19);
    shape.lineTo(0.025, -0.14);
    shape.lineTo(0.015, -0.25);
    shape.lineTo(-0.015, -0.25);
    shape.lineTo(-0.025, -0.14);
    shape.lineTo(-0.14, -0.19);
    shape.lineTo(-0.09, -0.08);
    shape.lineTo(-0.24, -0.02);
    shape.lineTo(-0.12, 0.03);
    shape.lineTo(-0.19, 0.16);
    shape.lineTo(-0.05, 0.1);
    shape.closePath();
  } else if (crest === 'crown') {
    shape.moveTo(-0.2, -0.13);
    shape.lineTo(0.2, -0.13);
    shape.lineTo(0.23, 0.12);
    shape.lineTo(0.11, 0.01);
    shape.lineTo(0, 0.19);
    shape.lineTo(-0.11, 0.01);
    shape.lineTo(-0.23, 0.12);
    shape.closePath();
  } else if (crest === 'blade') {
    shape.moveTo(0, 0.25);
    shape.lineTo(0.08, 0.06);
    shape.lineTo(0.18, -0.13);
    shape.lineTo(0.05, -0.1);
    shape.lineTo(0, -0.24);
    shape.lineTo(-0.05, -0.1);
    shape.lineTo(-0.18, -0.13);
    shape.lineTo(-0.08, 0.06);
    shape.closePath();
  } else if (crest === 'bolt') {
    shape.moveTo(0.05, 0.24);
    shape.lineTo(-0.15, 0.02);
    shape.lineTo(-0.02, 0.02);
    shape.lineTo(-0.06, -0.24);
    shape.lineTo(0.15, -0.02);
    shape.lineTo(0.02, -0.02);
    shape.closePath();
  } else if (crest === 'diamond') {
    shape.moveTo(0, 0.24);
    shape.lineTo(0.18, 0);
    shape.lineTo(0, -0.24);
    shape.lineTo(-0.18, 0);
    shape.closePath();
  } else if (crest === 'shield') {
    shape.moveTo(-0.18, 0.19);
    shape.lineTo(0.18, 0.19);
    shape.lineTo(0.18, -0.02);
    shape.lineTo(0, -0.23);
    shape.lineTo(-0.18, -0.02);
    shape.closePath();
  } else {
    shape.moveTo(0, 0.21);
    shape.lineTo(0.2, 0.03);
    shape.lineTo(0.14, -0.03);
    shape.lineTo(0, 0.1);
    shape.lineTo(-0.14, -0.03);
    shape.lineTo(-0.2, 0.03);
    shape.closePath();
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.028,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.009,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function createRoundedPlateGeometry(w: number, h: number, r: number, depth: number): THREE.ExtrudeGeometry {
  const hw = w / 2;
  const hh = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.028,
    bevelSize: 0.025,
    bevelSegments: 3,
  });
  geo.center();
  return geo;
}

/**
 * Builds an exact AAA Counter-Strike 2 Kilowatt / Revolution tactical weapon case replica:
 * - Wide tactical rifle/weapon-case proportions (W=2.48, D=1.52)
 * - Molded polymer PBR textures with edge scuffs, micro-scratches, roughness smudges & stipple bump
 * - Front carry handle pocket, knurled purge valve dial, dual heavy articulated cam clasps,
 *   3-knuckle rear steel hinges, X-brace ribbed lid crown, tactical corner guards
 * - Inside cavity with dark charcoal foam trim, bright golden-orange glow core & volumetric light rays
 */
export function buildTacticalCaseGroup(
  caseBox: Pick<CaseBox, 'id' | 'name' | 'tier'>,
  maxAnisotropy = 4
): TacticalCaseRig {
  const theme = resolveCaseTheme3D(caseBox);
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

  const polymerMaps = createCS2PolymerTextures(
    theme.bodyColor,
    theme.accentColor,
    caseBox.id + caseBox.name,
    maxAnisotropy
  );
  textures.push(polymerMaps.map, polymerMaps.roughnessMap, polymerMaps.bumpMap);

  const decalTex = createCS2DecalPlateTexture(theme, maxAnisotropy);
  textures.push(decalTex);

  const foamTex = createTacticalFoamTexture();
  textures.push(foamTex);

  const rayTex = createVolumetricRayTexture();
  textures.push(rayTex);

  const bodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: polymerMaps.map,
      roughnessMap: polymerMaps.roughnessMap,
      roughness: 0.92, // modulated by roughnessMap (0.38..0.68)
      metalness: 0.14,
      bumpMap: polymerMaps.bumpMap,
      bumpScale: 0.018,
    })
  );

  const lidMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: theme.lidColor,
      roughnessMap: polymerMaps.roughnessMap,
      roughness: 0.88,
      metalness: 0.18,
      bumpMap: polymerMaps.bumpMap,
      bumpScale: 0.018,
    })
  );

  const bumperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: theme.bumperColor,
      roughness: 0.78,
      metalness: 0.1,
      bumpMap: polymerMaps.bumpMap,
      bumpScale: 0.01,
    })
  );

  const steelMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#464E59',
      roughness: 0.28,
      metalness: 0.92,
      clearcoat: 0.25,
      clearcoatRoughness: 0.24,
    })
  );

  const hardwareMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: theme.hardwareColor,
      roughness: 0.22,
      metalness: 0.94,
      clearcoat: 0.4,
      clearcoatRoughness: 0.16,
    })
  );

  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: theme.accentColor,
      roughness: 0.34,
      metalness: 0.55,
      emissive: theme.accentColor,
      emissiveIntensity: 0.16,
    })
  );

  const decalMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: decalTex,
      roughness: 0.4,
      metalness: 0.52,
    })
  );

  const foamMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: foamTex,
      roughness: 0.92,
      metalness: 0.04,
      bumpMap: foamTex,
      bumpScale: 0.025,
    })
  );

  const interiorGlowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: '#FFA41B',
      transparent: true,
      opacity: 0.0,
    })
  );

  const interiorRimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#2A1B0A',
      emissive: '#FF8C00',
      emissiveIntensity: 0.0,
      roughness: 0.5,
      metalness: 0.3,
    })
  );

  // Authentic CS2 Weapon Case silhouette (sleek wide horizontal proportions)
  const W = 2.48;
  const D = 1.52;
  const baseH = 0.78;
  const footH = 0.045;

  // 1. Heavy Rubberized Base Pads (y = 0 grounded)
  const footGeo = trackGeo(new THREE.BoxGeometry(0.32, footH, 0.26));
  [
    [-W / 2 + 0.2, footH / 2, D / 2 - 0.17],
    [W / 2 - 0.2, footH / 2, D / 2 - 0.17],
    [-W / 2 + 0.2, footH / 2, -D / 2 + 0.17],
    [W / 2 - 0.2, footH / 2, -D / 2 + 0.17],
  ].forEach(([fx, fy, fz]) => {
    const foot = new THREE.Mesh(footGeo, bumperMat);
    foot.position.set(fx, fy, fz);
    foot.castShadow = true;
    foot.receiveShadow = true;
    root.add(foot);
  });

  // 2. Main Lower Molded CS2 Polymer Hull
  const hullGeo = trackGeo(createRoundedPlateGeometry(W, D, 0.12, baseH));
  hullGeo.rotateX(Math.PI / 2);
  const hullMesh = new THREE.Mesh(hullGeo, bodyMat);
  hullMesh.position.set(0, footH + baseH / 2, 0);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  root.add(hullMesh);

  // 3. Recessed Seal Gasket Rim & Weatherproof Collar
  const sealY = footH + baseH + 0.022;
  const gasketGeo = trackGeo(new THREE.BoxGeometry(W + 0.075, 0.055, D + 0.075));
  const gasketMesh = new THREE.Mesh(gasketGeo, bumperMat);
  gasketMesh.position.set(0, sealY, 0);
  gasketMesh.castShadow = true;
  root.add(gasketMesh);

  // 4. Vertical Structural Armor Ribs along Front, Back & Side Walls
  const ribGeo = trackGeo(new THREE.BoxGeometry(0.08, baseH * 0.78, 0.055));
  [-1.02, -0.88, 0.88, 1.02].forEach((rx) => {
    const fRib = new THREE.Mesh(ribGeo, lidMat);
    fRib.position.set(rx, footH + baseH * 0.5, D / 2 + 0.018);
    fRib.castShadow = true;
    root.add(fRib);

    const bRib = new THREE.Mesh(ribGeo, lidMat);
    bRib.position.set(rx, footH + baseH * 0.5, -D / 2 - 0.018);
    root.add(bRib);
  });

  // Side armored channels
  const sideRibGeo = trackGeo(new THREE.BoxGeometry(0.05, baseH * 0.72, 0.08));
  [-0.46, 0.46].forEach((sz) => {
    [-1, 1].forEach((side) => {
      const sRib = new THREE.Mesh(sideRibGeo, lidMat);
      sRib.position.set(side * (W / 2 + 0.018), footH + baseH * 0.5, sz);
      root.add(sRib);
    });
  });

  // 5. CS2 Stenciled Decal & Tactical Emblem Plate on Front Facade
  const frontBackingGeo = trackGeo(new THREE.BoxGeometry(1.18, 0.56, 0.036));
  const frontBacking = new THREE.Mesh(frontBackingGeo, bumperMat);
  frontBacking.position.set(0.08, footH + baseH * 0.46, D / 2 + 0.02);
  root.add(frontBacking);

  const decalGeo = trackGeo(new THREE.BoxGeometry(0.82, 0.31, 0.022));
  const decalMesh = new THREE.Mesh(decalGeo, decalMat);
  decalMesh.position.set(0.18, footH + baseH * 0.48, D / 2 + 0.038);
  root.add(decalMesh);

  // Engraved metallic Crest medallion beside decal
  const crestGeo = trackGeo(createCrestGeometry(theme.crest));
  const crestMesh = new THREE.Mesh(crestGeo, hardwareMat);
  crestMesh.scale.setScalar(0.56);
  crestMesh.position.set(-0.34, footH + baseH * 0.48, D / 2 + 0.044);
  crestMesh.castShadow = true;
  root.add(crestMesh);

  // Accent CS2 tactical stripe under front decal
  const frontStripeGeo = trackGeo(new THREE.BoxGeometry(1.1, 0.036, 0.025));
  const frontStripe = new THREE.Mesh(frontStripeGeo, accentMat);
  frontStripe.position.set(0.08, footH + baseH * 0.16, D / 2 + 0.034);
  root.add(frontStripe);

  // 6. Signature CS2 Purge / Pressure-Equalization Valve Dial (Front-Left)
  const valveOuterGeo = trackGeo(new THREE.CylinderGeometry(0.075, 0.082, 0.045, 18));
  valveOuterGeo.rotateX(Math.PI / 2);
  const valveOuter = new THREE.Mesh(valveOuterGeo, steelMat);
  valveOuter.position.set(-0.62, footH + baseH * 0.25, D / 2 + 0.03);
  root.add(valveOuter);

  const valveCoreGeo = trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 0.052, 12));
  valveCoreGeo.rotateX(Math.PI / 2);
  const valveCore = new THREE.Mesh(valveCoreGeo, hardwareMat);
  valveCore.position.set(-0.62, footH + baseH * 0.25, D / 2 + 0.035);
  root.add(valveCore);

  // 7. Bolted Corner Bumper Armor (Lower Base)
  const cornerGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.22, 0.24));
  [
    [-W / 2 + 0.035, footH + 0.1, D / 2 - 0.035],
    [W / 2 - 0.035, footH + 0.1, D / 2 - 0.035],
    [-W / 2 + 0.035, footH + 0.1, -D / 2 + 0.035],
    [W / 2 - 0.035, footH + 0.1, -D / 2 + 0.035],
  ].forEach(([cx, cy, cz]) => {
    const corner = new THREE.Mesh(cornerGeo, bumperMat);
    corner.position.set(cx, cy, cz);
    corner.castShadow = true;
    root.add(corner);
  });

  // 8. Heavy Folding Front Carry Handle Bar + Side Grips
  const frontHandleBracketGeo = trackGeo(new THREE.BoxGeometry(0.09, 0.09, 0.075));
  [-0.3, 0.3].forEach((hx) => {
    const hb = new THREE.Mesh(frontHandleBracketGeo, steelMat);
    hb.position.set(hx, footH + baseH * 0.85, D / 2 + 0.032);
    root.add(hb);
  });
  const frontHandleGripGeo = trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.56, 12));
  frontHandleGripGeo.rotateZ(Math.PI / 2);
  const frontHandleGrip = new THREE.Mesh(frontHandleGripGeo, bumperMat);
  frontHandleGrip.position.set(0, footH + baseH * 0.85, D / 2 + 0.068);
  frontHandleGrip.castShadow = true;
  root.add(frontHandleGrip);

  const sideMountGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.12, 0.56));
  const sideBarGeo = trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 0.44, 14));
  sideBarGeo.rotateX(Math.PI / 2);
  [-1, 1].forEach((side) => {
    const mount = new THREE.Mesh(sideMountGeo, bumperMat);
    mount.position.set(side * (W / 2 + 0.04), footH + baseH * 0.58, 0);
    root.add(mount);

    const grip = new THREE.Mesh(sideBarGeo, steelMat);
    grip.position.set(side * (W / 2 + 0.095), footH + baseH * 0.58, 0);
    grip.castShadow = true;
    root.add(grip);
  });

  // 9. Open Interior Cavity: Dark Foam Frame + Bright Golden-Orange Emissive Core + Volumetric Beams
  const foamBorderGeo = trackGeo(new THREE.BoxGeometry(W * 0.9, 0.05, D * 0.86));
  const foamBorder = new THREE.Mesh(foamBorderGeo, foamMat);
  foamBorder.position.set(0, sealY + 0.004, 0);
  root.add(foamBorder);

  // Glowing inner amber cavity bed
  const glowCoreGeo = trackGeo(new THREE.PlaneGeometry(W * 0.72, D * 0.68));
  glowCoreGeo.rotateX(-Math.PI / 2);
  const glowCore = new THREE.Mesh(glowCoreGeo, interiorGlowMat);
  glowCore.position.set(0, sealY + 0.034, 0.02);
  root.add(glowCore);

  // Glowing warm metallic bezel around open core
  const innerWallGeo = trackGeo(new THREE.BoxGeometry(W * 0.76, 0.06, D * 0.72));
  const innerWall = new THREE.Mesh(innerWallGeo, interiorRimMat);
  innerWall.position.set(0, sealY + 0.002, 0.02);
  root.add(innerWall);

  // 10. Volumetric Light Rays Rising Out of the Opened Base (Additive Blended Tapered Planes)
  const volumetricRays: VolumetricRayEntry[] = [];
  const rayConfigs = [
    { w: 2.05, h: 2.65, rotY: 0.0, tiltX: -0.06, posZ: 0.02 },
    { w: 1.85, h: 2.55, rotY: Math.PI / 3, tiltX: -0.04, posZ: 0.02 },
    { w: 1.85, h: 2.55, rotY: -Math.PI / 3, tiltX: -0.04, posZ: 0.02 },
    { w: 1.55, h: 2.25, rotY: Math.PI / 6, tiltX: 0.05, posZ: 0.05 },
    { w: 1.55, h: 2.25, rotY: -Math.PI / 6, tiltX: 0.05, posZ: 0.05 },
  ];

  rayConfigs.forEach((cfg) => {
    const geo = trackGeo(new THREE.PlaneGeometry(cfg.w, cfg.h));
    // Shift geometry origin to the bottom edge inside the open case cavity
    geo.translate(0, cfg.h / 2, 0);
    const mat = trackMat(
      new THREE.MeshBasicMaterial({
        map: rayTex,
        color: '#FFB347',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, sealY + 0.02, cfg.posZ);
    mesh.rotation.set(cfg.tiltX, cfg.rotY, 0);
    mesh.scale.set(1, 0.1, 1);
    mesh.visible = false;
    root.add(mesh);
    volumetricRays.push({ mesh, mat, baseScaleY: 1.0, baseRotY: cfg.rotY });
  });

  // 11. Hinged Heavy Upper CS2 Lid Group (pivoted at rear hinge seam to swing smoothly to 90 deg!)
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, sealY + 0.028, -D / 2);
  root.add(lidPivot);

  const lidH = 0.28;
  const lidGeo = trackGeo(createRoundedPlateGeometry(W + 0.055, D + 0.055, 0.12, lidH));
  lidGeo.rotateX(Math.PI / 2);
  const lidMesh = new THREE.Mesh(lidGeo, lidMat);
  lidMesh.position.set(0, lidH / 2 + 0.015, D / 2);
  lidMesh.castShadow = true;
  lidMesh.receiveShadow = true;
  lidPivot.add(lidMesh);

  // Inner Charcoal Foam Underside of the Lid (visible when lid opens to 90 degrees!)
  const innerLidFoamGeo = trackGeo(new THREE.BoxGeometry(W * 0.86, 0.032, D * 0.82));
  const innerLidFoam = new THREE.Mesh(innerLidFoamGeo, foamMat);
  innerLidFoam.position.set(0, 0.002, D / 2);
  lidPivot.add(innerLidFoam);

  // Molded Raised Crown Armor & CS2 X-Brace / Diagonal Ribs on Top Lid
  const crownGeo = trackGeo(new THREE.BoxGeometry(W * 0.78, 0.052, D * 0.74));
  const crownMesh = new THREE.Mesh(crownGeo, lidMat);
  crownMesh.position.set(0, lidH + 0.045, D / 2);
  crownMesh.castShadow = true;
  lidPivot.add(crownMesh);

  // Signature CS2 Kilowatt-style X-truss diagonal lid braces
  const diagLen = Math.hypot(W * 0.68, D * 0.62);
  const diagBarGeo = trackGeo(new THREE.BoxGeometry(diagLen, 0.038, 0.085));
  const diagYaw = Math.atan2(D * 0.62, W * 0.68);
  [-1, 1].forEach((dir) => {
    const brace = new THREE.Mesh(diagBarGeo, bumperMat);
    brace.position.set(0, lidH + 0.072, D / 2);
    brace.rotation.y = dir * diagYaw;
    brace.castShadow = true;
    lidPivot.add(brace);
  });

  // Central machined metallic cap at X intersection
  const centerHubGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.05, 0.34));
  const centerHub = new THREE.Mesh(centerHubGeo, steelMat);
  centerHub.position.set(0, lidH + 0.078, D / 2);
  centerHub.castShadow = true;
  lidPivot.add(centerHub);

  // Colored tactical stripe along front edge of the CS2 lid
  const lidTrimGeo = trackGeo(new THREE.BoxGeometry(0.96, 0.038, 0.042));
  const lidTrim = new THREE.Mesh(lidTrimGeo, accentMat);
  lidTrim.position.set(0, 0.075, D + 0.046);
  lidPivot.add(lidTrim);

  // Vertical reinforcing ribs across lid sides
  const topRibGeo = trackGeo(new THREE.BoxGeometry(0.085, 0.042, D * 0.9));
  [-0.98, -0.68, 0.68, 0.98].forEach((tx) => {
    const tr = new THREE.Mesh(topRibGeo, bodyMat);
    tr.position.set(tx, lidH + 0.048, D / 2);
    lidPivot.add(tr);
  });

  // Lid Corner Armor Bumpers
  const lidCornerGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.16, 0.24));
  [
    [-W / 2, lidH - 0.02, 0.035],
    [W / 2, lidH - 0.02, 0.035],
    [-W / 2, lidH - 0.02, D - 0.035],
    [W / 2, lidH - 0.02, D - 0.035],
  ].forEach(([lx, ly, lz]) => {
    const lc = new THREE.Mesh(lidCornerGeo, bumperMat);
    lc.position.set(lx, ly, lz);
    lidPivot.add(lc);
  });

  // 12. Dual Heavy-Duty Articulated Front Metallic Cam Clasps (snap upward/outward on unfasten!)
  const latches: THREE.Group[] = [];
  const latchHousingGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.34, 0.075));
  const latchPlateGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.22, 0.045));
  const latchHookGeo = trackGeo(new THREE.BoxGeometry(0.15, 0.06, 0.07));
  const latchPinGeo = trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.25, 10));
  latchPinGeo.rotateZ(Math.PI / 2);

  [-0.78, 0.78].forEach((lx) => {
    const housing = new THREE.Mesh(latchHousingGeo, bumperMat);
    housing.position.set(lx, sealY - 0.02, D / 2 + 0.04);
    root.add(housing);

    // Hinged clasp arm anchored at upper catch pin so unfastening flips it forward/outward
    const claspPivot = new THREE.Group();
    claspPivot.position.set(lx, sealY + 0.11, D / 2 + 0.07);

    const claspPlate = new THREE.Mesh(latchPlateGeo, steelMat);
    claspPlate.position.set(0, -0.1, 0.015);
    claspPlate.castShadow = true;
    claspPivot.add(claspPlate);

    const hook = new THREE.Mesh(latchHookGeo, hardwareMat);
    hook.position.set(0, -0.2, 0.025);
    hook.castShadow = true;
    claspPivot.add(hook);

    const pin = new THREE.Mesh(latchPinGeo, hardwareMat);
    pin.position.set(0, 0, 0);
    claspPivot.add(pin);

    root.add(claspPivot);
    latches.push(claspPivot);
  });

  // 13. Heavy 3-Knuckle Steel Rear Hinge Barrels
  const hingeOuterGeo = trackGeo(new THREE.CylinderGeometry(0.056, 0.056, 0.32, 14));
  hingeOuterGeo.rotateZ(Math.PI / 2);
  const hingeInnerGeo = trackGeo(new THREE.CylinderGeometry(0.062, 0.062, 0.12, 14));
  hingeInnerGeo.rotateZ(Math.PI / 2);

  [-0.76, 0, 0.76].forEach((hx) => {
    const hOut = new THREE.Mesh(hingeOuterGeo, steelMat);
    hOut.position.set(hx, sealY + 0.02, -D / 2 - 0.028);
    root.add(hOut);

    const hIn = new THREE.Mesh(hingeInnerGeo, hardwareMat);
    hIn.position.set(hx, sealY + 0.02, -D / 2 - 0.028);
    root.add(hIn);
  });

  return {
    root,
    lidPivot,
    latches,
    interiorGlowMat,
    interiorRimMat,
    volumetricRays,
    theme,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

// === SINGLE SHARED OFFSCREEN 3D THUMBNAIL RENDERER FOR DIRECTORY GRID ===
const thumbnailCache = new Map<string, string>();
let sharedThumbContext: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  envTarget: THREE.WebGLRenderTarget;
  shadowPlane: THREE.Mesh;
} | null = null;

function createSoftContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 122);
  grad.addColorStop(0, 'rgba(0,0,0,0.78)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.38)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function getSharedThumbStudio() {
  if (sharedThumbContext) return sharedThumbContext;
  if (typeof document === 'undefined') return null;

  try {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'default',
    });
    renderer.setSize(420, 315, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x161920, 0.78);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff4e0, 2.45);
    key.position.set(3.2, 4.8, 3.6);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x67e8f9, 1.15);
    rim.position.set(-3.6, 2.4, -2.5);
    scene.add(rim);

    const shadowTex = createSoftContactShadowTexture();
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 2.7),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.78,
      })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.005;
    scene.add(shadowPlane);

    const camera = new THREE.PerspectiveCamera(32, 420 / 315, 0.1, 30);
    camera.position.set(0, 1.44, 4.75);
    camera.lookAt(0, 0.56, 0);

    sharedThumbContext = { renderer, scene, camera, envTarget, shadowPlane };
    return sharedThumbContext;
  } catch {
    return null;
  }
}

export function renderCaseThumbnail3D(caseBox: Pick<CaseBox, 'id' | 'name' | 'tier'>): string | null {
  const theme = resolveCaseTheme3D(caseBox);
  const cacheKey = `cs2_v2_${caseBox.id}_${theme.accentColor}_${theme.crest}`;
  const existing = thumbnailCache.get(cacheKey);
  if (existing) return existing;

  const studio = getSharedThumbStudio();
  if (!studio) return null;

  const rig = buildTacticalCaseGroup(caseBox, studio.renderer.capabilities.getMaxAnisotropy());
  // Preserve signature 3/4 showcase angle & scale
  rig.root.rotation.y = -0.44;
  rig.root.rotation.x = 0.03;
  studio.scene.add(rig.root);

  studio.renderer.render(studio.scene, studio.camera);
  const dataUrl = studio.renderer.domElement.toDataURL('image/png');

  studio.scene.remove(rig.root);
  rig.dispose();

  thumbnailCache.set(cacheKey, dataUrl);
  return dataUrl;
}
