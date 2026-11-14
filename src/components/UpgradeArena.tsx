import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  LayoutGrid,
  RefreshCw,
  Search,
  Settings,
  X,
  Zap,
} from 'lucide-react';
import type { InventoryItem, ItemCard, Rarity, RollMode, UserProfile } from '../types';
import { resolveAssetUrl } from '../utils/assets';
import { useCleanCardImage } from '../utils/cardCutout';
import { calculateUpgradeOdds, formatTC, RARITY_LABELS, type UpgradeOdds } from '../utils/economics';
import { soundFX } from '../utils/sound';
import { CardFrame } from './CardFrame';
import { LegendaryRevealModal } from './LegendaryRevealModal';
import { TelegramPaperPlaneIcon } from './TelegramLoginModal';
import { GoatLogo } from './GoatLogo';

interface UpgradeArenaProps {
  user: UserProfile;
  items: ItemCard[];
  isAuthorized: boolean;
  externalTargetId?: string | null;
  onOpenTelegramLogin: () => void;
  onRollUpgrade: (params: {
    instanceIds: string[];
    balanceAdded: number;
    targetItemId: string;
    mode: RollMode;
  }) => Promise<{
    won: boolean;
    rollValue: number;
    targetItem: ItemCard;
    commitResult?: () => void;
  }>;
  onSellItems: (instanceIds: string[]) => Promise<void>;
  onGoToCases: () => void;
}

const TEN_PERCENT_ANGLES = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
const ITEMS_PER_PAGE = 16;

const RARITY_CARD_ACCENT: Record<Rarity, { bar: string; glow: string; borderSelected: string }> = {
  common: {
    bar: 'bg-slate-400',
    glow: 'from-slate-400/15',
    borderSelected: 'border-[#FACC15] bg-[#242014] shadow-[0_0_16px_rgba(250,204,21,0.22)]',
  },
  rare: {
    bar: 'bg-emerald-400',
    glow: 'from-emerald-500/20',
    borderSelected: 'border-[#FACC15] bg-[#1F2217] shadow-[0_0_16px_rgba(250,204,21,0.22)]',
  },
  epic: {
    bar: 'bg-purple-400',
    glow: 'from-purple-500/20',
    borderSelected: 'border-[#FACC15] bg-[#211B2B] shadow-[0_0_16px_rgba(250,204,21,0.22)]',
  },
  legendary: {
    bar: 'bg-[#FACC15]',
    glow: 'from-amber-400/25',
    borderSelected: 'border-[#FACC15] bg-[#2B2413] shadow-[0_0_18px_rgba(250,204,21,0.28)]',
  },
};

const TARGET_SLOT_GLOW: Record<
  Rarity,
  { backgroundImage: string; borderClass: string; orbRgba: string; textClass: string }
> = {
  common: {
    backgroundImage:
      'radial-gradient(ellipse 85% 60% at 50% 28%, rgba(148, 163, 184, 0.2) 0%, rgba(20, 22, 26, 0.96) 72%), linear-gradient(180deg, #1B1E25 0%, #14161A 100%)',
    borderClass: 'border-slate-400/20',
    orbRgba: 'rgba(148, 163, 184, 0.28)',
    textClass: 'text-slate-300',
  },
  rare: {
    backgroundImage:
      'radial-gradient(ellipse 85% 60% at 50% 28%, rgba(16, 185, 129, 0.24) 0%, rgba(20, 22, 26, 0.96) 72%), linear-gradient(180deg, #10231C 0%, #14161A 100%)',
    borderClass: 'border-emerald-400/25',
    orbRgba: 'rgba(52, 211, 153, 0.34)',
    textClass: 'text-emerald-300',
  },
  epic: {
    backgroundImage:
      'radial-gradient(ellipse 85% 60% at 50% 28%, rgba(168, 85, 247, 0.26) 0%, rgba(20, 22, 26, 0.96) 72%), linear-gradient(180deg, #1E142A 0%, #14161A 100%)',
    borderClass: 'border-purple-400/25',
    orbRgba: 'rgba(192, 132, 252, 0.36)',
    textClass: 'text-purple-300',
  },
  legendary: {
    backgroundImage:
      'radial-gradient(ellipse 85% 60% at 50% 28%, rgba(250, 204, 21, 0.22) 0%, rgba(20, 22, 26, 0.96) 72%), linear-gradient(180deg, #221B11 0%, #14161A 100%)',
    borderClass: 'border-amber-400/25',
    orbRgba: 'rgba(250, 204, 21, 0.35)',
    textClass: 'text-[#FACC15]',
  },
};

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vRot: number;
  tilt: number;
  vTilt: number;
  color: string;
  life: number;
  decay: number;
}

const CardSilhouetteSvg: React.FC<{ className?: string }> = ({ className = 'w-44 h-28' }) => (
  <svg viewBox="0 0 160 110" className={className} fill="currentColor" aria-hidden="true">
    <rect x="36" y="7" width="88" height="96" rx="8" />
    <rect x="43" y="15" width="74" height="80" rx="4" fill="#14161A" opacity=".45" />
    <path d="M51 27h58v40H51zM51 74h36v4H51zm0 9h25v3H51z" opacity=".72" />
  </svg>
);

const CompactCatalogTile: React.FC<{
  item: ItemCard;
  selected: boolean;
  disabledByPrice: boolean;
  onSelect: () => void;
}> = ({ item, selected, disabledByPrice, onSelect }) => {
  const { displayUrl } = useCleanCardImage(resolveAssetUrl(item.imageUrl));
  const style = RARITY_CARD_ACCENT[item.rarity] ?? RARITY_CARD_ACCENT.common;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative rounded-lg overflow-hidden border text-left transition-all duration-150 cursor-pointer p-2.5 flex flex-col justify-between h-[142px] bg-gradient-to-b ${style.glow} via-[#181B22] to-[#121419] ${
        selected
          ? style.borderSelected
          : 'border-white/[0.06] hover:border-white/20 hover:-translate-y-0.5'
      } ${disabledByPrice ? 'opacity-40' : ''}`}
    >
      {/* Thin top rarity accent bar */}
      <span aria-hidden="true" className={`absolute top-0 inset-x-0 h-[2px] ${style.bar}`} />

      {/* Top row: TC price + subtle rarity tag */}
      <div className="relative z-10 flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-mono-num font-bold text-[#FACC15]">
          <span>{formatTC(item.price)}</span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15] text-[#0B0D10] text-[7px] font-black inline-flex items-center justify-center">
            T
          </span>
        </span>
        {selected && (
          <span className="w-4 h-4 rounded bg-[#FACC15] text-[#0B0D10] text-[10px] font-black flex items-center justify-center">
            ✓
          </span>
        )}
      </div>

      {/* Centered Card Artwork */}
      <div className="relative flex-1 flex items-center justify-center my-1 min-h-0">
        {displayUrl && (
          <img
            src={displayUrl}
            alt={item.name}
            referrerPolicy="no-referrer"
            draggable={false}
            className="max-h-[76px] w-auto object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.75)] transition-transform duration-200 group-hover:scale-105"
          />
        )}
      </div>

      {/* Bottom Name & Rarity */}
      <div className="relative z-10 text-center">
        <div className="text-[11px] font-bold text-white truncate">{item.name}</div>
        <div className="text-[9px] text-slate-400 truncate">{RARITY_LABELS[item.rarity]}</div>
      </div>
    </button>
  );
};

const PreviewCenterCard: React.FC<{ item: ItemCard }> = ({ item }) => {
  const { displayUrl } = useCleanCardImage(resolveAssetUrl(item.imageUrl));
  return (
    <div className="flex flex-col items-center justify-center h-full">
      {displayUrl && (
        <img
          src={displayUrl}
          alt={item.name}
          referrerPolicy="no-referrer"
          draggable={false}
          className="h-20 w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.75)]"
        />
      )}
      <div className="mt-1 text-[10px] font-semibold text-white truncate max-w-full px-2">
        {item.name}
      </div>
    </div>
  );
};

export const UpgradeArena: React.FC<UpgradeArenaProps> = ({
  user,
  items,
  isAuthorized,
  externalTargetId,
  onOpenTelegramLogin,
  onRollUpgrade,
  onSellItems,
  onGoToCases,
}) => {
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
  const [targetItemId, setTargetItemId] = useState<string>(() => {
    const sorted = [...items].sort((a, b) => a.price - b.price);
    return sorted[Math.min(4, sorted.length - 1)]?.id ?? '';
  });
  const [rollMode, setRollMode] = useState<RollMode>('under');
  const [showModeSwitch, setShowModeSwitch] = useState(false);
  const [fastMode, setFastMode] = useState<boolean>(false);

  // Catalog search / price filters (no rarity tabs per reference)
  const [catSearch, setCatSearch] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [priceSort, setPriceSort] = useState<'asc' | 'desc'>('desc');
  const [catalogPage, setCatalogPage] = useState(0);

  // Wheel animation & frozen spin state
  const [isSpinning, setIsSpinning] = useState(false);
  const [frozenSpin, setFrozenSpin] = useState<{
    odds: UpgradeOdds;
    mode: RollMode;
    stakeTotal: number;
    stakedCards: { inv: InventoryItem; item: ItemCard }[];
    targetItem: ItemCard;
  } | null>(null);
  const [lastOutcome, setLastOutcome] = useState<{
    won: boolean;
    rollValue: number;
    targetName: string;
  } | null>(null);
  const [legendaryReveal, setLegendaryReveal] = useState<ItemCard | null>(null);
  const [error, setError] = useState('');

  const wheelBoxRef = useRef<HTMLDivElement | null>(null);
  const wheelDiscRef = useRef<SVGGElement | null>(null);
  const flapperRef = useRef<SVGSVGElement | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiRef = useRef<ConfettiParticle[]>([]);

  const physicsRef = useRef({
    wheelAngle: 0,
    startAngle: 0,
    targetAngle: 0,
    spinStartTime: 0,
    spinDuration: 4200,
    isSpinning: false,
    flapperAngle: 0,
    flapperVel: 0,
    prevPinBucket: 0,
    lastFrameTime: 0,
    pendingOutcome: null as { won: boolean; rollValue: number; targetItem: ItemCard; commitResult?: () => void } | null,
  });

  const itemsMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const resetWheelHome = useCallback(() => {
    if (physicsRef.current.isSpinning) return;
    physicsRef.current.wheelAngle = 0;
    physicsRef.current.prevPinBucket = 0;
    if (wheelDiscRef.current) {
      wheelDiscRef.current.setAttribute('transform', 'rotate(0 150 150)');
    }
  }, []);

  useEffect(() => {
    if (externalTargetId && itemsMap.has(externalTargetId) && !isSpinning) {
      setTargetItemId(externalTargetId);
      setLastOutcome(null);
      resetWheelHome();
    }
  }, [externalTargetId, itemsMap, isSpinning, resetWheelHome]);

  const burstUpgradeConfetti = useCallback((count = 85) => {
    const rect = wheelBoxRef.current?.getBoundingClientRect();
    const ox = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const oy = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.4;
    const colors = ['#FACC15', '#FB923C', '#10B981', '#FEF08A', '#FFFFFF'];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 180 + Math.random() * 520;
      confettiRef.current.push({
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 180,
        w: 5 + Math.random() * 6,
        h: 3.5 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 14,
        tilt: Math.random() * Math.PI,
        vTilt: 6 + Math.random() * 8,
        color: colors[i % colors.length],
        life: 1,
        decay: 0.45 + Math.random() * 0.28,
      });
    }
  }, []);

  useEffect(() => {
    if (isSpinning) return;
    const ownedSet = new Set(user.inventory.map((i) => i.instanceId));
    setSelectedInstanceIds((prev) => prev.filter((id) => ownedSet.has(id)));
  }, [user.inventory, isSpinning]);

  useEffect(() => {
    if (targetItemId && !itemsMap.has(targetItemId) && items.length > 0) {
      const sorted = [...items].sort((a, b) => a.price - b.price);
      setTargetItemId(sorted[sorted.length - 1].id);
    }
  }, [items, itemsMap, targetItemId]);

  useEffect(() => {
    const syncConfetti = () => {
      const c = confettiCanvasRef.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
      const ctx = c.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    syncConfetti();
    window.addEventListener('resize', syncConfetti);
    return () => window.removeEventListener('resize', syncConfetti);
  }, []);

  // Unified 60-144fps Upgrader Wheel Spin + Pointer Spring + Confetti Loop
  useEffect(() => {
    let rafId = 0;
    physicsRef.current.lastFrameTime = performance.now();

    const evaluateSpinCurve = (t: number) => {
      if (t >= 1) return 1;
      if (t < 0.05) {
        const p = t / 0.05;
        return 0.045 * (p * p);
      }
      const decelT = (t - 0.05) / 0.95;
      return 0.045 + 0.955 * (1 - Math.pow(1 - decelT, 4.2));
    };

    const tick = (now: number) => {
      const st = physicsRef.current;
      const dt = Math.min(0.033, Math.max(0.001, (now - st.lastFrameTime) / 1000));
      st.lastFrameTime = now;

      if (st.isSpinning) {
        const elapsed = now - st.spinStartTime;
        const progress = Math.min(1, elapsed / st.spinDuration);
        const eased = evaluateSpinCurve(progress);
        const nextAngle = st.startAngle + (st.targetAngle - st.startAngle) * eased;

        const angularVelocityDeg = (nextAngle - st.wheelAngle) / dt;
        st.wheelAngle = nextAngle;

        if (wheelDiscRef.current) {
          wheelDiscRef.current.setAttribute('transform', `rotate(${nextAngle.toFixed(2)} 150 150)`);
        }

        const currentBucket = Math.floor(nextAngle / 18);
        if (currentBucket !== st.prevPinBucket && progress < 0.985) {
          st.prevPinBucket = currentBucket;
          const velNorm = Math.min(1, Math.abs(angularVelocityDeg) / 1200);
          const kickAngle = -(10 + velNorm * 18);
          st.flapperAngle = Math.min(st.flapperAngle, kickAngle);
          st.flapperVel = -(140 + velNorm * 240);
          soundFX.playRouletteTick(progress);
        }

        if (progress >= 1) {
          st.isSpinning = false;
          st.wheelAngle = st.targetAngle;
          if (wheelDiscRef.current) {
            wheelDiscRef.current.setAttribute('transform', `rotate(${st.targetAngle.toFixed(2)} 150 150)`);
          }

          const outcome = st.pendingOutcome;
          st.pendingOutcome = null;

          setIsSpinning(false);
          setFrozenSpin(null);
          setSelectedInstanceIds([]);

          if (outcome) {
            if (outcome.commitResult) outcome.commitResult();
            setLastOutcome({
              won: outcome.won,
              rollValue: outcome.rollValue,
              targetName: outcome.targetItem.name,
            });

            if (outcome.won) {
              burstUpgradeConfetti(outcome.targetItem.rarity === 'legendary' ? 140 : 80);
              if (outcome.targetItem.rarity === 'legendary') {
                soundFX.playItemDropSound('legendary');
                soundFX.playLegendaryRevealSound();
                setLegendaryReveal(outcome.targetItem);
              } else {
                soundFX.playWin(outcome.targetItem.rarity);
              }
            } else {
              soundFX.playLoss();
            }
          }
        }
      }

      // Subtle damped spring pointer physics
      const stiffness = 560;
      const damping = 17.5;
      const accel = -stiffness * st.flapperAngle - damping * st.flapperVel;
      st.flapperVel += accel * dt;
      st.flapperAngle += st.flapperVel * dt;

      if (st.flapperAngle < -36) {
        st.flapperAngle = -36;
        st.flapperVel = Math.max(0, st.flapperVel);
      } else if (st.flapperAngle > 14) {
        st.flapperAngle = 14;
        st.flapperVel *= -0.35;
      }

      if (!st.isSpinning && Math.abs(st.flapperAngle) < 0.04 && Math.abs(st.flapperVel) < 0.5) {
        st.flapperAngle = 0;
        st.flapperVel = 0;
      }

      if (flapperRef.current) {
        flapperRef.current.style.transform = `rotate(${st.flapperAngle.toFixed(2)}deg)`;
      }

      const confCanvas = confettiCanvasRef.current;
      if (confCanvas && confettiRef.current.length > 0) {
        const cCtx = confCanvas.getContext('2d');
        if (cCtx) {
          const w = window.innerWidth;
          const h = window.innerHeight;
          cCtx.clearRect(0, 0, w, h);
          const list = confettiRef.current;
          for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            p.vy += 860 * dt;
            p.vx *= Math.pow(0.985, dt * 60);
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vRot * dt;
            p.tilt += p.vTilt * dt;
            p.life -= p.decay * dt;

            if (p.life <= 0 || p.y > h + 40) {
              list.splice(i, 1);
              continue;
            }

            cCtx.save();
            cCtx.globalAlpha = Math.max(0, Math.min(1, p.life));
            cCtx.translate(p.x, p.y);
            cCtx.rotate(p.rot);
            cCtx.scale(1, Math.cos(p.tilt));
            cCtx.fillStyle = p.color;
            cCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            cCtx.restore();
          }
        }
      } else if (confCanvas) {
        const cCtx = confCanvas.getContext('2d');
        cCtx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      const pending = physicsRef.current.pendingOutcome;
      if (pending?.commitResult) pending.commitResult();
    };
  }, [burstUpgradeConfetti]);

  const ownedEntries = useMemo(() => {
    return user.inventory
      .map((inv) => ({ inv, item: itemsMap.get(inv.itemId) }))
      .filter((x): x is { inv: InventoryItem; item: ItemCard } => Boolean(x.item))
      .sort((a, b) => b.item.price - a.item.price);
  }, [user.inventory, itemsMap]);

  const selectedOwned = useMemo(() => {
    const set = new Set(selectedInstanceIds);
    return ownedEntries.filter((x) => set.has(x.inv.instanceId));
  }, [ownedEntries, selectedInstanceIds]);

  const itemsStakeValue = useMemo(
    () => selectedOwned.reduce((acc, x) => acc + x.item.price, 0),
    [selectedOwned]
  );

  const displayedStakeCards = frozenSpin ? frozenSpin.stakedCards : selectedOwned;
  const targetItem = frozenSpin ? frozenSpin.targetItem : itemsMap.get(targetItemId) ?? null;

  const liveOdds = useMemo(() => {
    if (!targetItem) return { winChance: 0, multiplier: 0, minRoll: 0, maxRoll: 0 };
    return calculateUpgradeOdds(itemsStakeValue, targetItem.price, rollMode);
  }, [itemsStakeValue, targetItem, rollMode]);

  const displayOdds = frozenSpin ? frozenSpin.odds : liveOdds;
  const displayMode = frozenSpin ? frozenSpin.mode : rollMode;

  const filteredCatalog = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    const minP = priceFrom ? Number(priceFrom) : null;
    const maxP = priceTo ? Number(priceTo) : null;
    return [...items]
      .filter((it) => (!q ? true : it.name.toLowerCase().includes(q)))
      .filter((it) => (minP !== null && !Number.isNaN(minP) ? it.price >= minP : true))
      .filter((it) => (maxP !== null && !Number.isNaN(maxP) ? it.price <= maxP : true))
      .sort((a, b) => (priceSort === 'asc' ? a.price - b.price : b.price - a.price));
  }, [items, catSearch, priceFrom, priceTo, priceSort]);

  const totalPages = Math.max(1, Math.ceil(filteredCatalog.length / ITEMS_PER_PAGE));
  const safePage = Math.min(catalogPage, totalPages - 1);
  const pagedCatalog = useMemo(
    () => filteredCatalog.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE),
    [filteredCatalog, safePage]
  );

  useEffect(() => {
    setCatalogPage(0);
  }, [catSearch, priceFrom, priceTo, priceSort]);

  const previewSampleCards = useMemo(() => {
    if (items.length === 0) return [];
    const sorted = [...items].sort((a, b) => a.price - b.price);
    return [
      sorted[0],
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 2))],
      sorted[sorted.length - 1],
    ];
  }, [items]);

  const toggleInventoryItem = (instanceId: string) => {
    if (isSpinning || !isAuthorized) return;
    setError('');
    setLastOutcome(null);
    resetWheelHome();
    setSelectedInstanceIds((prev) =>
      prev.includes(instanceId) ? prev.filter((id) => id !== instanceId) : [...prev, instanceId]
    );
  };

  const handleUpgrade = async () => {
    if (isSpinning || physicsRef.current.isSpinning) return;
    setError('');

    if (!isAuthorized) {
      onOpenTelegramLogin();
      return;
    }

    if (!targetItem) {
      setError('Выберите карточку для апгрейда из каталога справа.');
      return;
    }

    if (itemsStakeValue <= 0) {
      setError('Выберите карточку из вашего инвентаря для апгрейда.');
      return;
    }

    if (itemsStakeValue >= targetItem.price) {
      setError('Целевой предмет должен стоить дороже вашей ставки.');
      return;
    }

    const snapshotOdds = calculateUpgradeOdds(itemsStakeValue, targetItem.price, rollMode);
    setFrozenSpin({
      odds: snapshotOdds,
      mode: rollMode,
      stakeTotal: itemsStakeValue,
      stakedCards: selectedOwned,
      targetItem,
    });
    setIsSpinning(true);
    setLastOutcome(null);

    try {
      const result = await onRollUpgrade({
        instanceIds: selectedInstanceIds,
        balanceAdded: 0,
        targetItemId: targetItem.id,
        mode: rollMode,
      });

      const st = physicsRef.current;
      const rollDegOnDisc = (result.rollValue / 100) * 360;
      const targetMod = ((360 - rollDegOnDisc) % 360 + 360) % 360;
      const currentMod = ((st.wheelAngle % 360) + 360) % 360;
      let deltaMod = targetMod - currentMod;
      if (deltaMod <= 0) deltaMod += 360;
      const extraSpins = fastMode ? 360 * 3 : 360 * 6;

      st.startAngle = st.wheelAngle;
      st.targetAngle = st.wheelAngle + extraSpins + deltaMod;
      st.spinDuration = fastMode ? 850 : 4200;
      st.spinStartTime = performance.now();
      st.prevPinBucket = Math.floor(st.wheelAngle / 18);
      st.pendingOutcome = result;
      st.isSpinning = true;
    } catch (err) {
      setIsSpinning(false);
      setFrozenSpin(null);
      setError(err instanceof Error ? err.message : 'Ошибка выполнения апгрейда.');
    }
  };

  const handleSellSelected = async () => {
    if (selectedInstanceIds.length === 0 || isSpinning || !isAuthorized) return;
    await onSellItems(selectedInstanceIds);
    soundFX.playCoin();
    setSelectedInstanceIds([]);
  };

  // SVG Ring Geometry (smooth yellow-orange progress arc matching reference 1)
  const radius = 112;
  const circumference = 2 * Math.PI * radius;
  const winArcLength = (displayOdds.winChance / 100) * circumference;
  const winArcRotation =
    displayMode === 'under'
      ? -90
      : -90 + ((100 - displayOdds.winChance) / 100) * 360;

  return (
    <div className="space-y-6">
      {typeof document !== 'undefined' &&
        createPortal(
          <canvas
            ref={confettiCanvasRef}
            aria-hidden="true"
            className="fixed inset-0 w-full h-full pointer-events-none z-50"
          />,
          document.body
        )}

      {/* Brand header */}
      <div className="motion-hero flex items-center justify-center gap-2 pt-1">
        <GoatLogo className="h-8 w-8 text-[#FACC15]" />
        <h1 className="text-xl font-display font-black tracking-wider text-white">Ферма</h1>
      </div>

      {/* Top 3-Column Upgrader Stage */}
      <section className="space-y-2.5">
        {/* Compact Icon Toolbar Above Left Slot (Settings / Sound / Lightning like Reference 1) */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowModeSwitch((v) => !v)}
              aria-label="Режим броска"
              title="Настройки ролла"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                showModeSwitch ? 'text-[#FACC15] bg-white/[0.06]' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setFastMode((v) => !v)}
              aria-pressed={fastMode}
              title="Быстрая прокрутка"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                fastMode ? 'text-[#FACC15] bg-[#FACC15]/15' : 'text-slate-400 hover:text-[#FACC15]'
              }`}
            >
              <Zap className="w-4 h-4" />
            </button>

            {showModeSwitch && (
              <div className="flex items-center gap-1 p-0.5 bg-[#14161A] border border-white/[0.06] rounded-md ml-1">
                <button
                  type="button"
                  disabled={isSpinning}
                  onClick={() => {
                    setRollMode('under');
                    setLastOutcome(null);
                    resetWheelHome();
                  }}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded cursor-pointer ${
                    displayMode === 'under' ? 'bg-[#FACC15]/20 text-[#FACC15]' : 'text-slate-400'
                  }`}
                >
                  Меньше (&lt;)
                </button>
                <button
                  type="button"
                  disabled={isSpinning}
                  onClick={() => {
                    setRollMode('over');
                    setLastOutcome(null);
                    resetWheelHome();
                  }}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded cursor-pointer ${
                    displayMode === 'over' ? 'bg-[#FACC15]/20 text-[#FACC15]' : 'text-slate-400'
                  }`}
                >
                  Больше (&gt;)
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          {/* Left Slot: Stake Items (No slider / No +100 buttons per reference 1) */}
          <div className="lg:col-span-4 bg-[#14161A] border border-white/[0.06] rounded-xl p-5 flex flex-col justify-between min-h-[300px]">
            <div className="text-center">
              <h2 className="text-sm font-display font-bold text-white">
                Выберите предметы или баланс
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Можно выбрать несколько карточек из инвентаря
              </p>
            </div>

            <div className="flex-1 flex items-center justify-center py-4">
              {displayedStakeCards.length > 0 ? (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div
                    key={displayedStakeCards.map((c) => c.inv.instanceId).join('-')}
                    className="flex flex-wrap items-center justify-center gap-2 animate-card-pop"
                  >
                    {displayedStakeCards.slice(0, 2).map(({ inv, item }) => (
                      <CardFrame
                        key={inv.instanceId}
                        item={item}
                        size={displayedStakeCards.length > 1 ? 'xs' : 'sm'}
                        onClick={() => toggleInventoryItem(inv.instanceId)}
                      />
                    ))}
                    {displayedStakeCards.length > 2 && (
                      <div className="text-xs font-mono-num font-bold text-[#FACC15] px-2">
                        +{displayedStakeCards.length - 2} еще
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono-num font-semibold text-[#FACC15]">
                      Ставка: {formatTC(itemsStakeValue)} TC
                    </span>
                    {!isSpinning && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInstanceIds([]);
                          setLastOutcome(null);
                          resetWheelHome();
                        }}
                        className="text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative flex items-center justify-center py-4">
                  {/* Dark Rifle Silhouette + Center Glowing Yellow Triple Down-Chevrons matching Reference 1 */}
                  <CardSilhouetteSvg className="w-48 h-28 text-[#0A0C0F] opacity-90" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-24 h-24 rounded-full bg-[#FACC15]/[0.14] blur-2xl" />
                    <svg viewBox="0 0 64 64" className="relative w-14 h-14 text-[#FACC15]" fill="currentColor" aria-hidden="true">
                      <path d="M32 28L16 14L20.5 9.5L32 19.5L43.5 9.5L48 14L32 28Z" opacity="0.45" />
                      <path d="M32 42L16 28L20.5 23.5L32 33.5L43.5 23.5L48 28L32 42Z" />
                      <path d="M32 55L16 41L20.5 36.5L32 46.5L43.5 36.5L48 41L32 55Z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center Minimal Industrial Upgrader Wheel (No pin-bulbs, double golden chevron ^^ inside) */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center space-y-4">
            <div
              ref={wheelBoxRef}
              className="relative w-[300px] h-[300px] flex items-center justify-center"
            >
              {lastOutcome && (
                <div
                  key={`${lastOutcome.rollValue}-${lastOutcome.won}`}
                  aria-hidden="true"
                  className={`absolute inset-1 rounded-full border-2 pointer-events-none animate-wheel-pulse ${
                    lastOutcome.won ? 'border-emerald-400/75' : 'border-rose-500/60'
                  }`}
                />
              )}

              {/* Subtle 12 o'clock Indicator Pointer */}
              <div
                aria-hidden="true"
                className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-7 h-9 z-30 pointer-events-none drop-shadow-[0_4px_8px_rgba(0,0,0,0.85)]"
              >
                <svg
                  ref={flapperRef}
                  data-testid="upgrade-flapper"
                  viewBox="0 0 60 80"
                  className="w-full h-full will-change-transform"
                  style={{ transformOrigin: '50% 20%' }}
                >
                  <path
                    d="M30 74 L18 22 C16 12, 22 6, 30 6 C38 6, 44 12, 42 22 Z"
                    fill="#FACC15"
                    stroke="#0B0D10"
                    strokeWidth="3"
                  />
                </svg>
              </div>

              <svg viewBox="0 0 300 300" className="relative z-10 w-[294px] h-[294px]">
                <defs>
                  <linearGradient id="winZoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FDE047" />
                    <stop offset="55%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#EA580C" />
                  </linearGradient>
                  <radialGradient id="wheelInnerGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#16181E" />
                    <stop offset="100%" stopColor="#0E1014" />
                  </radialGradient>
                </defs>

                {/* Base Dark Outer Ring */}
                <circle
                  cx="150"
                  cy="150"
                  r="138"
                  fill="#0E1014"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1.5"
                />

                {/* Rotating Disc Group: Track + Smooth Yellow-Orange Progress Ring + Subtle 10% Radial Lines */}
                <g ref={wheelDiscRef} transform="rotate(0 150 150)">
                  <circle
                    cx="150"
                    cy="150"
                    r={radius}
                    fill="none"
                    stroke="#1A1D24"
                    strokeWidth="22"
                  />

                  {/* Smooth Orange-Gold Winning Progress Ring */}
                  {displayOdds.winChance > 0 && (
                    <circle
                      cx="150"
                      cy="150"
                      r={radius}
                      fill="none"
                      stroke="url(#winZoneGrad)"
                      strokeWidth="22"
                      strokeDasharray={`${winArcLength} ${circumference}`}
                      transform={`rotate(${winArcRotation} 150 150)`}
                      style={{
                        transition: isSpinning
                          ? 'none'
                          : 'stroke-dasharray 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  )}

                  {/* Thin 10% Sector Hairlines (no bulky dots/pegs) */}
                  {TEN_PERCENT_ANGLES.map((deg) => (
                    <line
                      key={deg}
                      x1="150"
                      y1="24"
                      x2="150"
                      y2="54"
                      stroke="rgba(255,255,255,0.14)"
                      strokeWidth="1.2"
                      transform={`rotate(${deg} 150 150)`}
                    />
                  ))}
                </g>

                {/* Stationary Center Hub */}
                <circle
                  cx="150"
                  cy="150"
                  r="95"
                  fill="url(#wheelInnerGlow)"
                  stroke="rgba(255,255,255,0.07)"
                  strokeWidth="1.2"
                />
                <circle
                  cx="150"
                  cy="150"
                  r="72"
                  fill="none"
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="1"
                />
              </svg>

              {/* Wheel Center: Large Double Golden Chevron (^^) matching Reference 1 */}
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-10 pointer-events-none">
                <svg viewBox="0 0 64 58" className="w-16 h-14" fill="currentColor" aria-hidden="true">
                  <path d="M32 8L10 28L16.5 34.5L32 20L47.5 34.5L54 28L32 8Z" fill="#FACC15" />
                  <path d="M32 25L10 45L16.5 51.5L32 37L47.5 51.5L54 45L32 25Z" fill="#A16207" opacity="0.65" />
                </svg>

                {displayOdds.winChance > 0 && (
                  <span
                    data-testid="upgrade-chance"
                    className="mt-1 text-sm font-mono-num font-bold text-[#FACC15]"
                  >
                    {displayOdds.winChance.toFixed(2)}%
                  </span>
                )}

                {lastOutcome && (
                  <span
                    data-testid="upgrade-outcome"
                    className={`mt-1 text-xs font-bold animate-banner-in ${
                      lastOutcome.won ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {lastOutcome.won ? 'Победа' : 'Неудача'} · {lastOutcome.rollValue.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-400 text-center max-w-xs">{error}</p>
            )}

            {/* Primary Bright Yellow CTA Button matching Reference 1 */}
            <button
              type="button"
              data-testid="upgrade-submit"
              disabled={isSpinning}
              onClick={handleUpgrade}
              className="w-full max-w-[260px] py-3 px-6 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] disabled:opacity-60 text-[#0B0D10] font-display font-bold text-sm transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(250,204,21,0.22)] active:scale-[0.98]"
            >
              {isSpinning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Крутим...</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                    <path d="M12 5L5 12L7.2 14.2L12 9.4L16.8 14.2L19 12L12 5Z" />
                    <path d="M12 11L5 18L7.2 20.2L12 15.4L16.8 20.2L19 18L12 11Z" opacity="0.55" />
                  </svg>
                  <span>Апгрейд</span>
                </>
              )}
            </button>
          </div>

          {/* Right Slot: Target Item Showcase (Rarity-matched radial glow + clear X button) */}
          <div
            data-testid="upgrade-target-slot"
            data-rarity={targetItem?.rarity ?? 'none'}
            className={`relative lg:col-span-4 border rounded-xl p-5 flex flex-col justify-between min-h-[300px] overflow-hidden transition-all duration-300 ${
              targetItem ? TARGET_SLOT_GLOW[targetItem.rarity].borderClass : 'border-white/[0.06]'
            }`}
            style={{
              backgroundImage: targetItem
                ? TARGET_SLOT_GLOW[targetItem.rarity].backgroundImage
                : undefined,
              backgroundColor: '#14161A',
            }}
          >
            {targetItem && !isSpinning && (
              <button
                type="button"
                aria-label="Снять выбор цели"
                onClick={() => {
                  setTargetItemId('');
                  setLastOutcome(null);
                  resetWheelHome();
                }}
                className="absolute top-3 right-3 z-20 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {targetItem ? (
              <>
                <div className="relative z-10 text-center pt-0.5 px-6">
                  <div className={`text-[11px] font-semibold ${TARGET_SLOT_GLOW[targetItem.rarity].textClass}`}>
                    {RARITY_LABELS[targetItem.rarity]}
                  </div>
                  <h2 className="text-base font-display font-bold text-white truncate mt-0.5">
                    {targetItem.name}
                  </h2>
                </div>

                <div className="relative flex-1 flex items-center justify-center py-2">
                  <div
                    aria-hidden="true"
                    className="absolute w-36 h-36 rounded-full blur-2xl pointer-events-none transition-colors duration-300"
                    style={{ background: TARGET_SLOT_GLOW[targetItem.rarity].orbRgba }}
                  />
                  <div key={targetItem.id} className="relative z-10 animate-card-pop">
                    <CardFrame item={targetItem} size="sm" showPrice={false} />
                  </div>
                </div>

                <div className="relative z-10 text-center pb-0.5">
                  <span className="inline-flex items-center gap-1.5 text-base font-mono-num font-extrabold text-[#FACC15]">
                    <span>{formatTC(targetItem.price)}</span>
                    <span className="text-xs font-bold">TC</span>
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="text-center">
                  <h2 className="text-sm font-display font-bold text-white">
                    Выберите предмет для апгрейда
                  </h2>
                </div>
                <div className="flex-1 flex items-center justify-center py-4">
                  <div className="relative flex items-center justify-center">
                    <CardSilhouetteSvg className="w-48 h-28 text-[#0A0C0F] opacity-90" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-24 h-24 rounded-full bg-[#FACC15]/[0.14] blur-2xl" />
                      <svg viewBox="0 0 64 64" className="relative w-14 h-14 text-[#FACC15]" fill="currentColor" aria-hidden="true">
                        <path d="M32 9L16 23L20.5 27.5L32 17.5L43.5 27.5L48 23L32 9Z" />
                        <path d="M32 23L16 37L20.5 41.5L32 31.5L43.5 41.5L48 37L32 23Z" opacity="0.65" />
                        <path d="M32 37L16 51L20.5 55.5L32 45.5L43.5 55.5L48 51L32 37Z" opacity="0.35" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="h-5" />
              </>
            )}
          </div>
        </div>
      </section>

      {/* Bottom 2-Column Inventory & Target Catalog */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Bottom-Left: My Inventory OR Telegram Authorization State matching Reference 1 */}
        <section className="lg:col-span-6 bg-[#14161A] border border-white/[0.06] rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-[#FACC15] text-[#0B0D10] flex items-center justify-center font-bold text-xs">
                {isAuthorized ? ownedEntries.length : '✦'}
              </div>
              <div className="w-7 h-7 rounded-md bg-[#1D2028] text-slate-400 flex items-center justify-center">
                <LayoutGrid className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-sm font-display font-bold text-white ml-1">Мой инвентарь</h2>
            </div>

            {isAuthorized && selectedInstanceIds.length > 0 && (
              <button
                type="button"
                disabled={isSpinning}
                onClick={handleSellSelected}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 transition-colors cursor-pointer flex items-center gap-1"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Продать за {formatTC(itemsStakeValue)} TC</span>
              </button>
            )}
          </div>

          {!isAuthorized ? (
            <div className="flex-1 flex flex-col items-center justify-start pt-3 pb-2 gap-5">
              <div className="flex flex-col items-center text-center space-y-2.5">
                <h3 className="text-base font-display font-bold text-white">
                  You are not authorized
                </h3>
                <p className="text-xs text-slate-400">
                  Log in via Telegram to access upgrades
                </p>
                <button
                  type="button"
                  data-testid="inventory-telegram-login"
                  onClick={onOpenTelegramLogin}
                  className="mt-1 inline-flex items-center gap-2.5 px-6 py-2 rounded-full bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-display font-bold text-xs transition-all cursor-pointer shadow-[0_0_24px_rgba(250,204,21,0.2)]"
                >
                  <span>Login via Telegram</span>
                  <TelegramPaperPlaneIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Preview Showcase Slots with Yellow-Framed Center Card matching Reference 1 */}
              <div className="grid grid-cols-3 gap-3 w-full items-center pt-1">
                <div className="h-28 rounded-xl bg-[#0D0F12]/70 border border-white/[0.04] flex items-center justify-center p-2 opacity-35">
                  <CardSilhouetteSvg className="w-20 h-14 text-slate-700" />
                </div>

                <div className="h-36 rounded-xl bg-[#111318] border border-[#FACC15]/75 p-2 shadow-[0_0_20px_rgba(250,204,21,0.12)] flex items-center justify-center">
                  {previewSampleCards[1] && <PreviewCenterCard item={previewSampleCards[1]} />}
                </div>

                <div className="h-28 rounded-xl bg-[#0D0F12]/70 border border-white/[0.04] flex items-center justify-center p-2 opacity-35">
                  <CardSilhouetteSvg className="w-20 h-14 text-slate-700 scale-x-[-1]" />
                </div>
              </div>
            </div>
          ) : ownedEntries.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 border border-dashed border-white/10 rounded-xl">
              <p className="text-sm text-slate-300">Инвентарь пуст</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Откройте кейс, чтобы получить карточки для апгрейда
              </p>
              <button
                type="button"
                onClick={onGoToCases}
                className="px-4 py-2 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] text-xs font-bold cursor-pointer"
              >
                Перейти к кейсам
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[540px] overflow-y-auto pr-1">
              {ownedEntries.map(({ inv, item }) => (
                <div key={inv.instanceId} className="flex justify-center">
                  <CardFrame
                    item={item}
                    size="sm"
                    selected={selectedInstanceIds.includes(inv.instanceId)}
                    onClick={() => toggleInventoryItem(inv.instanceId)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Bottom-Right: Upgrade Target Catalog (No rarity tabs, compact header inputs & compact colored cards) */}
        <section className="lg:col-span-6 bg-[#14161A] border border-white/[0.06] rounded-xl p-5 flex flex-col justify-between">
          <div>
            {/* Single-Line Toolbar matching Reference 1 */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#FACC15]" fill="currentColor" aria-hidden="true">
                  <path d="M12 5L5 12L7.2 14.2L12 9.4L16.8 14.2L19 12L12 5Z" />
                  <path d="M12 11L5 18L7.2 20.2L12 15.4L16.8 20.2L19 18L12 11Z" opacity="0.55" />
                </svg>
                <h2 className="text-sm font-display font-bold text-white whitespace-nowrap">
                  Улучшить до
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPriceSort((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  aria-label="Сортировка по цене"
                  title={priceSort === 'desc' ? 'Сначала дорогие' : 'Сначала дешевые'}
                  className="p-2 rounded-lg bg-[#0D0F12] border border-white/[0.08] hover:border-[#FACC15]/50 text-slate-300 hover:text-[#FACC15] transition-colors cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  value={priceFrom}
                  onChange={(e) => setPriceFrom(e.target.value)}
                  placeholder="от TC"
                  aria-label="Цена от"
                  className="w-20 px-2.5 py-1.5 rounded-lg bg-[#0D0F12] border border-white/[0.08] text-xs font-mono-num text-white focus:outline-none focus:border-[#FACC15]"
                />
                <input
                  type="number"
                  value={priceTo}
                  onChange={(e) => setPriceTo(e.target.value)}
                  placeholder="до TC"
                  aria-label="Цена до"
                  className="w-20 px-2.5 py-1.5 rounded-lg bg-[#0D0F12] border border-white/[0.08] text-xs font-mono-num text-white focus:outline-none focus:border-[#FACC15]"
                />
                <div className="relative w-36 sm:w-44">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={catSearch}
                    onChange={(e) => setCatSearch(e.target.value)}
                    placeholder="Поиск..."
                    aria-label="Поиск карточки в каталоге"
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-[#0D0F12] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
              </div>
            </div>

            {pagedCatalog.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-white/[0.08] rounded-xl">
                Подходящие карточки не найдены
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {pagedCatalog.map((item) => {
                  const isSelected = targetItemId === item.id;
                  const disabledByPrice =
                    isAuthorized && itemsStakeValue > 0 && item.price <= itemsStakeValue;
                  return (
                    <CompactCatalogTile
                      key={item.id}
                      item={item}
                      selected={isSelected}
                      disabledByPrice={disabledByPrice}
                      onSelect={() => {
                        if (isSpinning) return;
                        setTargetItemId(item.id);
                        setLastOutcome(null);
                        setError('');
                        resetWheelHome();
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Centered Pagination Controls matching Reference 1 */}
          <div className="flex items-center justify-center gap-2 pt-4 mt-4 border-t border-white/[0.05]">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setCatalogPage((p) => Math.max(0, p - 1))}
              aria-label="Предыдущая страница"
              className="w-7 h-7 rounded-md bg-[#1C1F26] hover:bg-[#252932] disabled:opacity-35 text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setCatalogPage((p) => Math.min(totalPages - 1, p + 1))}
              aria-label="Следующая страница"
              className="w-7 h-7 rounded-md bg-[#1C1F26] hover:bg-[#252932] disabled:opacity-35 text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </div>

      <LegendaryRevealModal
        item={legendaryReveal}
        sourceLabel="Успешный апгрейд!"
        onClose={() => setLegendaryReveal(null)}
      />
    </div>
  );
};
