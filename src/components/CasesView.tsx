import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Coins,
  Plus,
  RotateCcw,
  Search,
  Zap,
} from 'lucide-react';
import type { CaseBox, InventoryItem, ItemCard, Rarity, UserProfile } from '../types';
import { resolveAssetUrl } from '../utils/assets';
import { useCleanCardImage } from '../utils/cardCutout';
import { calculateCaseDropProbabilities, formatTC, RARITY_LABELS } from '../utils/economics';
import { soundFX } from '../utils/sound';
import { CardFrame } from './CardFrame';
import { ScrollReveal } from './ScrollReveal';
import { CaseStage3D } from './CaseStage3D';
import { CaseThumbnail3D } from './CaseThumbnail3D';
import { LegendaryRevealModal } from './LegendaryRevealModal';
import { TelegramPaperPlaneIcon } from './TelegramLoginModal';

interface CasesViewProps {
  user: UserProfile;
  isAuthorized: boolean;
  cases: CaseBox[];
  items: ItemCard[];
  onOpenTelegramLogin: () => void;
  onOpenCase: (caseId: string) => Promise<{
    item: ItemCard;
    instance: InventoryItem;
  }>;
  onSellItems: (instanceIds: string[]) => Promise<void>;
  onOpenDeposit: () => void;
  onGoToCreateCase?: () => void;
}

const CARD_SLOT_WIDTH = 144;

const RARITY_TILE_ACCENT: Record<Rarity, { bar: string; glow: string }> = {
  common: { bar: 'bg-slate-400', glow: 'from-slate-400/15' },
  rare: { bar: 'bg-emerald-400', glow: 'from-emerald-500/20' },
  epic: { bar: 'bg-purple-400', glow: 'from-purple-500/20' },
  legendary: { bar: 'bg-[#FACC15]', glow: 'from-amber-400/25' },
};

const STAGE_GLOW_BY_TIER: Record<Rarity, { backgroundImage: string; borderClass: string }> = {
  common: {
    backgroundImage:
      'radial-gradient(ellipse 75% 55% at 50% 34%, rgba(148, 163, 184, 0.16) 0%, rgba(20, 22, 26, 0.96) 72%), linear-gradient(180deg, #1B1E25 0%, #14161A 100%)',
    borderClass: 'border-slate-400/20',
  },
  rare: {
    backgroundImage:
      'radial-gradient(ellipse 75% 55% at 50% 34%, rgba(16, 185, 129, 0.2) 0%, rgba(20, 22, 26, 0.96) 72%), linear-gradient(180deg, #10231C 0%, #14161A 100%)',
    borderClass: 'border-emerald-400/25',
  },
  epic: {
    backgroundImage:
      'radial-gradient(ellipse 75% 55% at 50% 34%, rgba(168, 85, 247, 0.22) 0%, rgba(20, 22, 26, 0.96) 72%), linear-gradient(180deg, #1E142A 0%, #14161A 100%)',
    borderClass: 'border-purple-400/25',
  },
  legendary: {
    backgroundImage:
      'radial-gradient(ellipse 75% 55% at 50% 34%, rgba(250, 204, 21, 0.2) 0%, rgba(20, 22, 26, 0.96) 72%), linear-gradient(180deg, #221B11 0%, #14161A 100%)',
    borderClass: 'border-amber-400/25',
  },
};

const RISK_LABEL_BY_TIER: Record<Rarity, { label: string; textClass: string }> = {
  common: { label: 'LOW', textClass: 'text-slate-300' },
  rare: { label: 'MEDIUM', textClass: 'text-emerald-400' },
  epic: { label: 'HIGH', textClass: 'text-purple-400' },
  legendary: { label: 'VIP', textClass: 'text-[#FACC15]' },
};

const CompactDropItemTile: React.FC<{ item: ItemCard; probability: number }> = ({
  item,
  probability,
}) => {
  const { displayUrl } = useCleanCardImage(resolveAssetUrl(item.imageUrl));
  const style = RARITY_TILE_ACCENT[item.rarity] ?? RARITY_TILE_ACCENT.common;

  return (
    <div
      className={`relative rounded-xl overflow-hidden border border-white/[0.06] p-3 flex flex-col justify-between h-[164px] bg-gradient-to-b ${style.glow} via-[#181B22] to-[#121419]`}
    >
      <span aria-hidden="true" className={`absolute top-0 inset-x-0 h-[2px] ${style.bar}`} />

      <div className="relative z-10 flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-mono-num font-bold text-[#FACC15]">
          <span>{formatTC(item.price)}</span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15] text-[#0B0D10] text-[7px] font-black inline-flex items-center justify-center">
            T
          </span>
        </span>
        <span className="text-[10px] font-mono-num font-semibold text-slate-400">
          {probability.toFixed(1)}%
        </span>
      </div>

      <div className="relative flex-1 flex items-center justify-center my-1 min-h-0">
        {displayUrl && (
          <img
            src={displayUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
            className="max-h-[84px] w-auto object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.75)]"
          />
        )}
      </div>

      <div className="relative z-10 text-center">
        <div className="text-[11px] font-bold text-white truncate">{item.name}</div>
        <div className="text-[9px] text-slate-400 truncate">{RARITY_LABELS[item.rarity]}</div>
      </div>
    </div>
  );
};

export const CasesView: React.FC<CasesViewProps> = ({
  user,
  isAuthorized,
  cases,
  items,
  onOpenTelegramLogin,
  onOpenCase,
  onSellItems,
  onOpenDeposit,
  onGoToCreateCase,
}) => {
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [caseTab, setCaseTab] = useState<'all' | 'author'>('all');
  const [caseSearch, setCaseSearch] = useState('');
  const [showAllAuthor, setShowAllAuthor] = useState(false);

  const [fastOpen, setFastOpen] = useState(false);
  const [isOpeningLid, setIsOpeningLid] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [stageEntryKey, setStageEntryKey] = useState(0);
  const [tapeItems, setTapeItems] = useState<ItemCard[]>([]);
  const [wonDrop, setWonDrop] = useState<{ item: ItemCard; instance: InventoryItem } | null>(null);
  const [legendaryModalOpen, setLegendaryModalOpen] = useState(false);
  const [error, setError] = useState('');

  const tapeContainerRef = useRef<HTMLDivElement | null>(null);
  const tapeReelRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);
  const lidTimeoutRef = useRef<number | null>(null);

  const itemsMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const activeCase = useMemo(
    () => cases.find((c) => c.id === activeCaseId) ?? null,
    [cases, activeCaseId]
  );

  const activeCaseProbabilities = useMemo(() => {
    if (!activeCase) return [];
    const cItems = activeCase.itemIds
      .map((id) => itemsMap.get(id))
      .filter((it): it is ItemCard => Boolean(it));
    return calculateCaseDropProbabilities(activeCase, cItems);
  }, [activeCase, itemsMap]);

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (lidTimeoutRef.current) clearTimeout(lidTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!activeCase || activeCaseProbabilities.length === 0) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (lidTimeoutRef.current) clearTimeout(lidTimeoutRef.current);

    const pool = activeCaseProbabilities.map((p) => p.item);
    const preview: ItemCard[] = [];
    for (let i = 0; i < 42; i++) {
      preview.push(pool[i % pool.length]);
    }
    setTapeItems(preview);
    tapeReelRef.current?.style.setProperty('transform', 'translate3d(0,0,0)');
    setIsOpeningLid(false);
    setIsOpening(false);
    setWonDrop(null);
    setLegendaryModalOpen(false);
    setError('');
  }, [activeCaseId]);

  const filteredCases = useMemo(() => {
    const q = caseSearch.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [cases, caseSearch]);

  const officialCases = useMemo(
    () => filteredCases.filter((c) => !c.id.startsWith('case_custom') && c.id !== 'case_drips'),
    [filteredCases]
  );

  const authorCases = useMemo(() => {
    const custom = filteredCases.filter((c) => c.id.startsWith('case_custom') || c.id === 'case_drips');
    return custom.length > 0 || caseSearch.trim().length > 0 ? custom : filteredCases.slice(-2);
  }, [filteredCases, caseSearch]);

  const handleSpinCase = async () => {
    if (!activeCase || isOpening || isOpeningLid) return;
    setError('');

    if (!isAuthorized) {
      onOpenTelegramLogin();
      return;
    }

    if (user.balance < activeCase.price) {
      setError('Недостаточно Т-коинов. Пополните баланс.');
      return;
    }

    const from3DShowcase = !wonDrop;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setWonDrop(null);
    setLegendaryModalOpen(false);

    if (from3DShowcase && !fastOpen && !reduceMotion) {
      setIsOpeningLid(true);
    }

    try {
      const apiPromise = onOpenCase(activeCase.id);

      if (from3DShowcase && !fastOpen && !reduceMotion) {
        await new Promise<void>((resolve) => {
          lidTimeoutRef.current = window.setTimeout(resolve, 1500);
        });
      }

      const result = await apiPromise;
      setIsOpeningLid(false);
      setIsOpening(true);

      const pool = activeCaseProbabilities.map((p) => p.item);
      const winIndex = 34;
      const generated: ItemCard[] = [];
      for (let i = 0; i < 44; i++) {
        if (i === winIndex) {
          generated.push(result.item);
        } else {
          const rand = Math.random() * 100;
          let acc = 0;
          let chosen = pool[0];
          for (const entry of activeCaseProbabilities) {
            acc += entry.probability;
            if (rand <= acc) {
              chosen = entry.item;
              break;
            }
          }
          generated.push(chosen);
        }
      }

      setTapeItems(generated);
      tapeReelRef.current?.style.setProperty('transform', 'translate3d(0,0,0)');

      requestAnimationFrame(() => requestAnimationFrame(() => {
        const containerWidth = tapeContainerRef.current?.clientWidth ?? 800;
        const jitter = (Math.random() - 0.5) * 44;
        const targetOffset =
          winIndex * CARD_SLOT_WIDTH + CARD_SLOT_WIDTH / 2 - containerWidth / 2 + jitter;
        const duration = reduceMotion || fastOpen ? 650 : 3900;
        const startTime = performance.now();
        let lastSlotIndex = Math.floor(containerWidth / 2 / CARD_SLOT_WIDTH);

        const animate = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / duration);
          const eased = 1 - Math.pow(1 - progress, 4.2);
          const currentOffset = targetOffset * eased;
          tapeReelRef.current?.style.setProperty('transform', `translate3d(-${currentOffset}px,0,0)`);

          const currentSlotIndex = Math.floor((currentOffset + containerWidth / 2) / CARD_SLOT_WIDTH);
          if (currentSlotIndex !== lastSlotIndex) {
            lastSlotIndex = currentSlotIndex;
            soundFX.playCaseTick(progress);
          }

          if (progress < 1) {
            animRef.current = requestAnimationFrame(animate);
          } else {
            soundFX.playItemDropSound(result.item.rarity);
            setIsOpening(false);
            setWonDrop(result);

            if (result.item.rarity === 'legendary') {
              soundFX.playLegendaryRevealSound();
              setLegendaryModalOpen(true);
            }
          }
        };

        animRef.current = requestAnimationFrame(animate);
      }));
    } catch (err) {
      setIsOpeningLid(false);
      setIsOpening(false);
      setError(err instanceof Error ? err.message : 'Не удалось открыть кейс.');
    }
  };

  const handleSellDrop = async () => {
    if (!wonDrop) return;
    await onSellItems([wonDrop.instance.instanceId]);
    soundFX.playCoin();
    setWonDrop(null);
    setLegendaryModalOpen(false);
    setStageEntryKey((k) => k + 1);
  };

  const handleReturnTo3D = () => {
    if (isOpening || isOpeningLid) return;
    setWonDrop(null);
    setStageEntryKey((k) => k + 1);
  };

  // === UPGRADER-STYLED CASE DIRECTORY ===
  if (!activeCase) {
    return (
      <div className="space-y-6">
        {/* Centered Hero Title matching UPGRADER */}
        <div className="flex items-center justify-center gap-2 pt-1">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#FACC15]" fill="currentColor" aria-hidden="true">
            <path d="M12 4L4 11.5L6.2 13.7L12 8.2L17.8 13.7L20 11.5L12 4Z" />
            <path d="M12 10.5L4 18L6.2 20.2L12 14.7L17.8 20.2L20 18L12 10.5Z" opacity="0.6" />
          </svg>
          <h1 className="text-xl font-display font-black tracking-wider uppercase text-white">
            КЕЙСЫ
          </h1>
        </div>

        {/* Single-Line Filter Toolbar Panel matching Upgrader Catalog Header */}
        <div className="bg-[#14161A] border border-white/[0.06] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setCaseTab('all')}
              className={`relative py-1.5 text-xs font-display font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                caseTab === 'all' ? 'text-[#FACC15]' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Все кейсы</span>
              {caseTab === 'all' && (
                <span className="absolute inset-x-0 -bottom-[15px] h-[2px] bg-[#FACC15] shadow-[0_0_8px_rgba(250,204,21,0.75)] rounded-full" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setCaseTab('author')}
              className={`relative py-1.5 text-xs font-display font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                caseTab === 'author' ? 'text-[#FACC15]' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Авторские кейсы</span>
              {caseTab === 'author' && (
                <span className="absolute inset-x-0 -bottom-[15px] h-[2px] bg-[#FACC15] shadow-[0_0_8px_rgba(250,204,21,0.75)] rounded-full" />
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-44 sm:w-52">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
                placeholder="Поиск кейса..."
                aria-label="Поиск кейса"
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-[#0D0F12] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            {onGoToCreateCase && (
              <button
                type="button"
                onClick={onGoToCreateCase}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-display font-bold text-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать кейс</span>
              </button>
            )}
          </div>
        </div>

        {/* Section 1: Official Cases */}
        {caseTab === 'all' && officialCases.length > 0 && (
          <section className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#FACC15]" fill="currentColor" aria-hidden="true">
                  <path d="M12 5L5 12L7.2 14.2L12 9.4L16.8 14.2L19 12L12 5Z" />
                  <path d="M12 11L5 18L7.2 20.2L12 15.4L16.8 20.2L19 18L12 11Z" opacity="0.55" />
                </svg>
                <h2 className="text-sm font-display font-bold text-white">Основные кейсы</h2>
              </div>
              <span className="text-[11px] font-mono-num text-slate-500">
                {officialCases.length} шт.
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {officialCases.map((caseBox, idx) => {
                const tileStyle = RARITY_TILE_ACCENT[caseBox.tier] ?? RARITY_TILE_ACCENT.rare;
                return (
                  <ScrollReveal key={caseBox.id} delayMs={idx * 35} className="h-full">
                  <button
                    type="button"
                    onClick={() => setActiveCaseId(caseBox.id)}
                    className={`group relative rounded-xl overflow-hidden border border-white/[0.06] hover:border-[#FACC15]/55 text-left transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:shadow-xl cursor-pointer p-3 flex flex-col justify-between h-[210px] bg-gradient-to-b ${tileStyle.glow} via-[#181B22] to-[#121419] motion-press`}
                  >
                    <span aria-hidden="true" className={`absolute top-0 inset-x-0 h-[2px] ${tileStyle.bar}`} />

                    <div className="relative z-10 flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono-num font-bold text-[#FACC15]">
                        <span>{formatTC(caseBox.price)}</span>
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15] text-[#0B0D10] text-[7px] font-black inline-flex items-center justify-center">
                          T
                        </span>
                      </span>
                      <span className="text-[9px] font-display font-bold uppercase tracking-wider text-[#FACC15] bg-[#FACC15]/10 px-1.5 py-0.5 rounded">
                        NEW
                      </span>
                    </div>

                    <div className="relative flex-1 flex items-center justify-center my-1 min-h-0">
                      <CaseThumbnail3D
                        caseBox={caseBox}
                        className="relative w-full h-full object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.75)] transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                      />
                    </div>

                    <div className="relative z-10 text-center">
                      <div className="text-xs font-bold text-white truncate">{caseBox.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {caseBox.itemIds.length} карт · {RARITY_LABELS[caseBox.tier]}
                      </div>
                    </div>
                  </button>
                  </ScrollReveal>
                );
              })}
            </div>
          </section>
        )}

        {caseTab === 'all' && filteredCases.length === 0 && (
          <div className="bg-[#14161A] border border-white/[0.06] rounded-xl py-12 text-center text-sm text-slate-400">
            Кейсы по запросу «{caseSearch}» не найдены.
          </div>
        )}

        {/* Section 2: Author Cases */}
        {(authorCases.length > 0 || caseTab === 'author') && (
          <section className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#FACC15]" fill="currentColor" aria-hidden="true">
                  <path d="M12 5L5 12L7.2 14.2L12 9.4L16.8 14.2L19 12L12 5Z" />
                  <path d="M12 11L5 18L7.2 20.2L12 15.4L16.8 20.2L19 18L12 11Z" opacity="0.55" />
                </svg>
                <h2 className="text-sm font-display font-bold text-white">Авторские кейсы</h2>
              </div>
              <span className="text-[11px] font-mono-num text-slate-500">
                {(showAllAuthor ? filteredCases : authorCases).length} шт.
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {(showAllAuthor ? filteredCases : authorCases).map((caseBox, idx) => {
                const tileStyle = RARITY_TILE_ACCENT[caseBox.tier] ?? RARITY_TILE_ACCENT.rare;
                const risk = RISK_LABEL_BY_TIER[caseBox.tier] ?? RISK_LABEL_BY_TIER.rare;
                return (
                  <ScrollReveal key={`author-${caseBox.id}`} delayMs={idx * 35} className="h-full">
                  <button
                    type="button"
                    onClick={() => setActiveCaseId(caseBox.id)}
                    className={`group relative rounded-xl overflow-hidden border border-white/[0.06] hover:border-[#FACC15]/55 text-left transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:shadow-xl cursor-pointer p-3 flex flex-col justify-between h-[210px] bg-gradient-to-b ${tileStyle.glow} via-[#181B22] to-[#121419] motion-press`}
                  >
                    <span aria-hidden="true" className={`absolute top-0 inset-x-0 h-[2px] ${tileStyle.bar}`} />

                    <div className="relative z-10 flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono-num font-bold text-[#FACC15]">
                        <span>{formatTC(caseBox.price)}</span>
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15] text-[#0B0D10] text-[7px] font-black inline-flex items-center justify-center">
                          T
                        </span>
                      </span>
                      <span className={`text-[9px] font-display font-bold uppercase tracking-wider ${risk.textClass}`}>
                        ★ {risk.label}
                      </span>
                    </div>

                    <div className="relative flex-1 flex items-center justify-center my-1 min-h-0">
                      <CaseThumbnail3D
                        caseBox={caseBox}
                        className="relative w-full h-full object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.75)] transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                      />
                    </div>

                    <div className="relative z-10 text-center">
                      <div className="text-xs font-bold text-white truncate">{caseBox.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {caseBox.itemIds.length} карт · {RARITY_LABELS[caseBox.tier]}
                      </div>
                    </div>
                  </button>
                  </ScrollReveal>
                );
              })}
            </div>

            {filteredCases.length > authorCases.length && (
              <button
                type="button"
                onClick={() => setShowAllAuthor((v) => !v)}
                className="w-full py-2.5 rounded-lg bg-[#0D0F12] hover:bg-[#191C22] border border-white/[0.06] text-xs font-display font-bold uppercase tracking-wider text-slate-300 hover:text-[#FACC15] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>{showAllAuthor ? 'Скрыть' : 'Показать ещё'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllAuthor ? 'rotate-180' : ''}`} />
              </button>
            )}
          </section>
        )}
      </div>
    );
  }

  // === UPGRADER-STYLED 3D CASE OPENING STAGE ===
  const showingRouletteStage = isOpening || wonDrop !== null;
  const stageGlow = STAGE_GLOW_BY_TIER[activeCase.tier] ?? STAGE_GLOW_BY_TIER.epic;

  return (
    <div className="space-y-5">
      {/* Top Toolbar matching Upgrader utility row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={isOpening || isOpeningLid}
          onClick={() => setActiveCaseId(null)}
          className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#14161A] border border-white/[0.06] text-xs font-display font-bold uppercase tracking-wider text-slate-300 hover:text-[#FACC15] disabled:opacity-40 cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Назад к кейсам</span>
        </button>

        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#FACC15]" fill="currentColor" aria-hidden="true">
            <path d="M12 4L4 11.5L6.2 13.7L12 8.2L17.8 13.7L20 11.5L12 4Z" />
            <path d="M12 10.5L4 18L6.2 20.2L12 14.7L17.8 20.2L20 18L12 10.5Z" opacity="0.6" />
          </svg>
          <h1 className="text-lg font-display font-black uppercase tracking-wider text-white">
            {activeCase.name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {wonDrop && !isOpening && (
            <button
              type="button"
              onClick={handleReturnTo3D}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#14161A] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>3D кейс</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setFastOpen((v) => !v)}
            aria-pressed={fastOpen}
            title="Быстрая прокрутка"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wider rounded-lg border transition-colors cursor-pointer ${
              fastOpen
                ? 'bg-[#FACC15]/15 border-[#FACC15]/40 text-[#FACC15]'
                : 'bg-[#14161A] border-white/[0.06] text-slate-400 hover:text-[#FACC15]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Быстро</span>
          </button>
        </div>
      </div>

      {/* Main Spotlight Opening Card matching Upgrader target showcase */}
      <section
        className={`relative rounded-xl border p-5 sm:p-6 overflow-hidden ${stageGlow.borderClass}`}
        style={{
          backgroundImage: stageGlow.backgroundImage,
          backgroundColor: '#14161A',
        }}
      >
        <div className="relative h-[265px] sm:h-[310px] w-full flex items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute inset-x-10 bottom-2 h-10 rounded-full bg-black/45 blur-xl pointer-events-none"
          />

          {!showingRouletteStage ? (
            <div className="relative w-full h-full">
              <CaseStage3D
                caseBox={activeCase}
                isOpeningLid={isOpeningLid}
                entryKey={stageEntryKey}
              />
            </div>
          ) : (
            <div className="w-full max-w-5xl mx-auto animate-banner-in">
              <div
                ref={tapeContainerRef}
                className="relative h-60 bg-[#0B0D10]/95 border border-white/[0.08] rounded-xl overflow-hidden flex items-center shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
              >
                {/* Yellow Upgrader Center Laser Pin */}
                <div
                  aria-hidden="true"
                  className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[3px] bg-[#FACC15] z-20 shadow-[0_0_14px_rgba(250,204,21,0.9)]"
                >
                  <div className="w-3 h-3 bg-[#FACC15] rotate-45 -translate-x-[4.5px] -translate-y-1.5" />
                  <div className="w-3 h-3 bg-[#FACC15] rotate-45 -translate-x-[4.5px] absolute bottom-[-6px]" />
                </div>

                <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0B0D10] to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0B0D10] to-transparent z-10 pointer-events-none" />

                <div ref={tapeReelRef} className="flex items-center will-change-transform">
                  {tapeItems.map((item, idx) => (
                    <div
                      key={`${item.id}-${idx}`}
                      className="shrink-0 flex justify-center"
                      style={{ width: `${CARD_SLOT_WIDTH}px` }}
                    >
                      <CardFrame item={item} size="sm" showPrice={false} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-col items-center text-center space-y-3">
          <p className="text-xs text-slate-400 max-w-xl mx-auto">{activeCase.description}</p>

          {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}

          {wonDrop ? (
            <div
              key={wonDrop.instance.instanceId}
              data-testid="case-win-banner"
              className="animate-banner-in w-full max-w-2xl bg-[#0D0F12] border border-[#FACC15]/40 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-left"
            >
              <div className="flex items-center gap-4">
                <CardFrame item={wonDrop.item} size="xs" showPrice={false} />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FACC15]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Выпала карточка!</span>
                  </div>
                  <div className="text-base sm:text-lg font-display font-bold text-white mt-0.5">
                    {wonDrop.item.name}
                  </div>
                  <div className="text-xs text-slate-400 font-mono-num">
                    {RARITY_LABELS[wonDrop.item.rarity]} · Цена {formatTC(wonDrop.item.price)} TC
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSellDrop}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-emerald-300 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Coins className="w-4 h-4" />
                  <span>Продать за {formatTC(wonDrop.item.price)} TC</span>
                </button>
                <button
                  type="button"
                  onClick={handleSpinCase}
                  className="px-5 py-2.5 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-display font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-[0_0_24px_rgba(250,204,21,0.22)]"
                >
                  Открыть еще · {formatTC(activeCase.price)} TC
                </button>
              </div>
            </div>
          ) : !isAuthorized ? (
            <button
              type="button"
              onClick={onOpenTelegramLogin}
              className="min-w-[260px] px-7 py-3 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-display font-bold text-sm transition-all cursor-pointer inline-flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(250,204,21,0.22)]"
            >
              <TelegramPaperPlaneIcon className="w-4 h-4" />
              <span>Войти через Telegram для открытия</span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {!isOpening && !isOpeningLid && user.balance < activeCase.price && (
                <button
                  type="button"
                  onClick={onOpenDeposit}
                  className="px-5 py-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-white font-display font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
                >
                  Пополнить баланс
                </button>
              )}
              <button
                type="button"
                data-testid="case-open-submit"
                disabled={isOpening || isOpeningLid || user.balance < activeCase.price}
                onClick={handleSpinCase}
                className="min-w-[260px] px-7 py-3 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] disabled:bg-[#232830] disabled:text-slate-500 text-[#0B0D10] font-display font-bold text-sm transition-all cursor-pointer shadow-[0_0_24px_rgba(250,204,21,0.22)] active:scale-[0.98]"
              >
                {isOpeningLid
                  ? 'Открываем замок...'
                  : isOpening
                  ? 'Крутим рулетку...'
                  : `Открыть · ${formatTC(activeCase.price)} TC`}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Bottom Dark Contents Grid matching Upgrader Catalog Cards */}
      <section className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#FACC15]" fill="currentColor" aria-hidden="true">
              <path d="M12 5L5 12L7.2 14.2L12 9.4L16.8 14.2L19 12L12 5Z" />
              <path d="M12 11L5 18L7.2 20.2L12 15.4L16.8 20.2L19 18L12 11Z" opacity="0.55" />
            </svg>
            <h2 className="text-sm font-display font-bold text-white">Содержимое кейса</h2>
          </div>
          <span className="text-xs text-slate-500 font-mono-num">
            {activeCaseProbabilities.length} предметов
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {activeCaseProbabilities.map(({ item, probability }) => (
            <CompactDropItemTile key={item.id} item={item} probability={probability} />
          ))}
        </div>
      </section>

      <LegendaryRevealModal
        item={legendaryModalOpen && wonDrop ? wonDrop.item : null}
        sourceLabel={`Кейс «${activeCase.name}»`}
        onClose={() => setLegendaryModalOpen(false)}
        onSell={handleSellDrop}
      />
    </div>
  );
};
