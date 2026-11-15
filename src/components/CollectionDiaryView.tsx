import React, { useMemo, useState } from 'react';
import { ArrowLeft, Award, BookOpen, CheckCircle2, Gift, Lock, Sparkles, Trophy } from 'lucide-react';
import type { ItemCard, Rarity } from '../types';
import { resolveAssetUrl } from '../utils/assets';
import { useCleanCardImage } from '../utils/cardCutout';
import {
  getAvailableCollections,
  getCollectionTextClass,
  resolveCardCollection,
} from '../utils/collections';
import { evaluateCollectionSetStatus, type CollectionSetReward } from '../utils/collectionSets';
import { formatTC, RARITY_LABELS } from '../utils/economics';
import {
  getCardDiscoveryXp,
  getLevelProgress,
  getTotalCatalogXp,
  RARITY_DISCOVERY_XP,
} from '../utils/progression';
import { soundFX } from '../utils/sound';
import { TelegramPaperPlaneIcon } from './TelegramLoginModal';

interface CollectionDiaryViewProps {
  items: ItemCard[];
  unlockedItemIds: string[];
  claimedCollections?: string[];
  equippedBadgeCollection?: string | null;
  totalXp: number;
  isAuthorized: boolean;
  onBack: () => void;
  onOpenTelegramLogin: () => void;
  onClaimCollectionReward?: (collection: string) => Promise<CollectionSetReward>;
  onEquipBadge?: (collection: string | null) => Promise<void>;
}

const RARITY_ACCENTS: Record<Rarity, { bar: string; badge: string; glow: string }> = {
  common: {
    bar: 'bg-slate-400',
    badge: 'text-slate-300',
    glow: 'from-slate-500/15',
  },
  rare: {
    bar: 'bg-emerald-400',
    badge: 'text-emerald-300',
    glow: 'from-emerald-500/20',
  },
  super_rare: {
    bar: 'bg-sky-400',
    badge: 'text-sky-300',
    glow: 'from-sky-500/20',
  },
  epic: {
    bar: 'bg-purple-400',
    badge: 'text-purple-300',
    glow: 'from-purple-500/22',
  },
  legendary: {
    bar: 'bg-[#FACC15]',
    badge: 'text-[#FACC15]',
    glow: 'from-amber-400/25',
  },
};

const DiaryCardTile: React.FC<{
  item: ItemCard;
  unlocked: boolean;
}> = ({ item, unlocked }) => {
  const { displayUrl } = useCleanCardImage(resolveAssetUrl(item.imageUrl));
  const accent = RARITY_ACCENTS[item.rarity] ?? RARITY_ACCENTS.common;
  const rewardXp = getCardDiscoveryXp(item);
  const collection = resolveCardCollection(item);

  return (
    <article
      data-testid={`diary-card-${item.id}`}
      data-unlocked={unlocked ? 'true' : 'false'}
      className={`relative rounded-xl overflow-hidden border p-3 flex flex-col justify-between transition-colors ${
        unlocked
          ? `border-white/[0.1] bg-gradient-to-b ${accent.glow} via-[#171A21] to-[#111318]`
          : 'border-white/[0.05] bg-[#101216]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0 inset-x-0 h-[2px] ${unlocked ? accent.bar : 'bg-white/10'}`}
      />

      {/* Top row: XP value & Unlock Status */}
      <div className="relative z-10 flex items-center justify-between gap-1.5">
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono-num font-bold ${
            unlocked
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/25'
              : 'bg-[#FACC15]/10 text-[#FACC15] border border-[#FACC15]/25'
          }`}
          title={
            unlocked
              ? `Получено ${rewardXp} XP за открытие`
              : `Откройте карту, чтобы получить ${rewardXp} XP`
          }
        >
          <Sparkles className="w-2.5 h-2.5 shrink-0" />
          <span>+{rewardXp} XP</span>
        </span>

        {unlocked ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400"
            title="Карта открыта"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Открыта</span>
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500"
            title="Карта ещё не выбита"
          >
            <Lock className="w-3 h-3" />
            <span>Закрыта</span>
          </span>
        )}
      </div>

      {/* Card Artwork (dimmed if locked, vibrant if unlocked) */}
      <div className="relative flex items-center justify-center my-2.5 h-32">
        {displayUrl && (
          <img
            src={displayUrl}
            alt={item.name}
            referrerPolicy="no-referrer"
            draggable={false}
            className={`max-h-32 w-auto object-contain transition-all duration-300 ${
              unlocked
                ? 'brightness-100 grayscale-0 drop-shadow-[0_10px_18px_rgba(0,0,0,0.85)]'
                : 'brightness-[0.34] contrast-110 grayscale opacity-60 drop-shadow-[0_6px_12px_rgba(0,0,0,0.9)]'
            }`}
          />
        )}
        {!unlocked && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="w-8 h-8 rounded-full bg-black/65 border border-white/15 flex items-center justify-center text-slate-300/80 shadow-lg">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="relative z-10 space-y-1 text-center">
        <div
          className={`text-xs font-bold truncate ${unlocked ? 'text-white' : 'text-slate-400'}`}
          title={item.name}
        >
          {item.name}
        </div>
        <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5">
          <span className={unlocked ? accent.badge : 'text-slate-500'}>
            {RARITY_LABELS[item.rarity]}
          </span>
          <span className={`font-medium truncate ${unlocked ? getCollectionTextClass(collection) : 'text-slate-600'}`}>
            {collection}
          </span>
        </div>
        <div className="text-[10px] font-mono-num text-slate-500">
          Цена: {formatTC(item.price)} TC
        </div>
      </div>
    </article>
  );
};

export const CollectionDiaryView: React.FC<CollectionDiaryViewProps> = ({
  items,
  unlockedItemIds,
  claimedCollections = [],
  equippedBadgeCollection = null,
  totalXp,
  isAuthorized,
  onBack,
  onOpenTelegramLogin,
  onClaimCollectionReward,
  onEquipBadge,
}) => {
  const [selectedCollection, setSelectedCollection] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [busyCollection, setBusyCollection] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const unlockedSet = useMemo(() => new Set(unlockedItemIds), [unlockedItemIds]);
  const levelInfo = useMemo(() => getLevelProgress(totalXp), [totalXp]);
  const totalCatalogXp = useMemo(() => getTotalCatalogXp(items), [items]);
  const earnedCatalogXp = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (unlockedSet.has(item.id) ? getCardDiscoveryXp(item) : 0),
        0
      ),
    [items, unlockedSet]
  );

  const unlockedCount = useMemo(
    () => items.filter((item) => unlockedSet.has(item.id)).length,
    [items, unlockedSet]
  );
  const lockedCount = Math.max(0, items.length - unlockedCount);

  const collections = useMemo(() => getAvailableCollections(items), [items]);

  const groupedSections = useMemo(() => {
    const activeCollections =
      selectedCollection === 'all'
        ? collections
        : collections.filter((col) => col === selectedCollection);

    return activeCollections
      .map((collectionName) => {
        const allInCollection = items
          .filter((item) => resolveCardCollection(item) === collectionName)
          .sort((a, b) => a.price - b.price);

        const unlockedInCollection = allInCollection.filter((item) =>
          unlockedSet.has(item.id)
        ).length;
        const totalCollectionXp = allInCollection.reduce(
          (sum, item) => sum + getCardDiscoveryXp(item),
          0
        );
        const earnedCollectionXp = allInCollection.reduce(
          (sum, item) => sum + (unlockedSet.has(item.id) ? getCardDiscoveryXp(item) : 0),
          0
        );

        const visibleCards = allInCollection.filter((item) => {
          const isUnlocked = unlockedSet.has(item.id);
          if (statusFilter === 'unlocked') return isUnlocked;
          if (statusFilter === 'locked') return !isUnlocked;
          return true;
        });

        const setReward = evaluateCollectionSetStatus(
          collectionName,
          items,
          unlockedItemIds,
          claimedCollections
        );

        return {
          collectionName,
          allInCollection,
          visibleCards,
          unlockedInCollection,
          totalCollectionXp,
          earnedCollectionXp,
          setReward,
        };
      })
      .filter((section) => section.visibleCards.length > 0);
  }, [collections, items, selectedCollection, statusFilter, unlockedSet, unlockedItemIds, claimedCollections]);

  const handleClaim = async (collectionName: string) => {
    if (!onClaimCollectionReward || busyCollection) return;
    setBusyCollection(collectionName);
    setNotice(null);
    try {
      const reward = await onClaimCollectionReward(collectionName);
      soundFX.playCoin();
      setNotice({
        text: `Коллекция «${collectionName}» собрана! Получено +${formatTC(reward.rewardTc)} TC, +${reward.rewardXp} XP и бейдж «${reward.badgeTitle}».`,
        ok: true,
      });
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Не удалось забрать бонус коллекции.',
        ok: false,
      });
    } finally {
      setBusyCollection(null);
    }
  };

  const handleToggleEquip = async (collectionName: string, currentlyEquipped: boolean) => {
    if (!onEquipBadge || busyCollection) return;
    setBusyCollection(collectionName);
    setNotice(null);
    try {
      await onEquipBadge(currentlyEquipped ? null : collectionName);
      setNotice({
        text: currentlyEquipped
          ? 'Бейдж снят с профиля.'
          : `Бейдж коллекции «${collectionName}» установлен в профиле!`,
        ok: true,
      });
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Не удалось обновить бейдж.',
        ok: false,
      });
    } finally {
      setBusyCollection(null);
    }
  };

  const completionPct =
    items.length > 0 ? Math.round((unlockedCount / items.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Bar with Back Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#14161A] hover:bg-[#1C1F26] border border-white/[0.08] text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#FACC15]" />
          <span>Назад в профиль</span>
        </button>

        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#FACC15]" />
          <h1 className="text-lg sm:text-xl font-display font-black tracking-wider uppercase text-white">
            Коллекционный дневник
          </h1>
        </div>

        <div className="text-xs font-mono-num text-slate-400">
          Открыто: <span className="text-white font-bold">{unlockedCount}</span> / {items.length} ({completionPct}%)
        </div>
      </div>

      {/* Diary Hero Summary + Level Bar + Rarity XP Table */}
      <section
        className="border border-white/[0.06] rounded-xl p-5 space-y-4"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 60% at 15% 0%, rgba(250, 204, 21, 0.08) 0%, rgba(20, 22, 26, 0.96) 72%)',
          backgroundColor: '#14161A',
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-7 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FACC15] text-[#0B0D10] font-display font-black text-xs">
                  <Trophy className="w-3.5 h-3.5" />
                  Уровень {levelInfo.level}
                </span>
                <span className="text-sm font-display font-bold text-white">
                  {levelInfo.title}
                </span>
              </div>
              <span className="text-xs font-mono-num text-slate-300">
                <span className="text-[#FACC15] font-bold">{levelInfo.currentLevelXp}</span> /{' '}
                {levelInfo.nextLevelXp} XP
              </span>
            </div>

            <div
              role="progressbar"
              aria-label="Опыт уровня в коллекционном дневнике"
              aria-valuemin={0}
              aria-valuemax={levelInfo.nextLevelXp}
              aria-valuenow={levelInfo.currentLevelXp}
              className="w-full h-2.5 rounded-full bg-[#0D0F12] border border-white/[0.06] overflow-hidden"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#EAB308] via-[#FACC15] to-[#FEF08A] transition-all duration-500"
                style={{ width: `${levelInfo.progressPercent}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              <span>
                Опыт дневника: <span className="text-white font-mono-num font-semibold">{earnedCatalogXp}</span> /{' '}
                <span className="font-mono-num">{totalCatalogXp} XP</span>
              </span>
              <span>
                Всего накоплено: <span className="text-[#FACC15] font-mono-num font-semibold">{levelInfo.totalXp} XP</span>
              </span>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#0D0F12] border border-white/[0.06] rounded-xl p-3.5 space-y-2">
            <div className="text-[11px] font-semibold text-slate-300">
              Награда опыта за первую поимку карты:
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="flex items-center justify-between px-2 py-1 rounded bg-emerald-500/10 border border-emerald-400/20">
                <span className="text-emerald-300">Редкая</span>
                <span className="font-mono-num font-bold text-white">+{RARITY_DISCOVERY_XP.rare} XP</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded bg-sky-500/10 border border-sky-400/20">
                <span className="text-sky-300">Сверхредкая</span>
                <span className="font-mono-num font-bold text-white">+{RARITY_DISCOVERY_XP.super_rare} XP</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded bg-purple-500/10 border border-purple-400/20">
                <span className="text-purple-300">Эпическая</span>
                <span className="font-mono-num font-bold text-white">+{RARITY_DISCOVERY_XP.epic} XP</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded bg-[#FACC15]/10 border border-[#FACC15]/25">
                <span className="text-[#FACC15]">Легендарная</span>
                <span className="font-mono-num font-bold text-white">+{RARITY_DISCOVERY_XP.legendary} XP</span>
              </div>
            </div>
          </div>
        </div>

        {!isAuthorized && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2AABEE]/25 bg-[#2AABEE]/[0.06] px-4 py-3">
            <p className="text-xs text-slate-300">
              Войдите через Telegram, чтобы открывать карточки из кейсов и апгрейдов и копить опыт уровня.
            </p>
            <button
              type="button"
              onClick={onOpenTelegramLogin}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] text-xs font-display font-bold transition-colors cursor-pointer"
            >
              <span>Войти через Telegram</span>
              <TelegramPaperPlaneIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* Filters Bar: Status + Collection Tabs */}
      <section className="bg-[#14161A] border border-white/[0.06] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Фильтр по статусу открытия">
            {(
              [
                { id: 'all', label: `Все (${items.length})` },
                { id: 'unlocked', label: `Открытые (${unlockedCount})` },
                { id: 'locked', label: `Неоткрытые (${lockedCount})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === opt.id
                    ? 'bg-[#FACC15] text-[#0B0D10]'
                    : 'bg-[#0D0F12] text-slate-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Разделение по коллекциям">
            <button
              type="button"
              onClick={() => setSelectedCollection('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                selectedCollection === 'all'
                  ? 'bg-white/15 text-white border border-white/25'
                  : 'bg-[#0D0F12] text-slate-400 hover:text-white border border-white/[0.06]'
              }`}
            >
              Все коллекции
            </button>
            {collections.map((col) => {
              const colItems = items.filter((item) => resolveCardCollection(item) === col);
              const colUnlocked = colItems.filter((item) => unlockedSet.has(item.id)).length;
              const isActive = selectedCollection === col;
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => setSelectedCollection(col)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-[#FACC15]/15 text-[#FACC15] border border-[#FACC15]/35'
                      : 'bg-[#0D0F12] text-slate-300 hover:text-white border border-white/[0.06]'
                  }`}
                >
                  <span>{col}</span>
                  <span className="text-[10px] font-mono-num text-slate-400">
                    {colUnlocked}/{colItems.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {notice && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-xs font-medium ${
            notice.ok
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-400/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Collection Sections */}
      {groupedSections.length === 0 ? (
        <div className="bg-[#14161A] border border-dashed border-white/10 rounded-xl py-12 text-center space-y-2">
          <p className="text-sm text-slate-400">В выбранном фильтре пока нет карточек.</p>
          <button
            type="button"
            onClick={() => {
              setSelectedCollection('all');
              setStatusFilter('all');
            }}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedSections.map((section) => {
            const { setReward } = section;
            const isEquipped = equippedBadgeCollection === section.collectionName;
            const isBusy = busyCollection === section.collectionName;

            return (
              <section
                key={section.collectionName}
                data-testid={`diary-collection-${section.collectionName}`}
                className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2
                        className={`text-base font-display font-bold ${getCollectionTextClass(
                          section.collectionName
                        )}`}
                      >
                        Коллекция «{section.collectionName}»
                      </h2>
                      <span className="px-2 py-0.5 rounded bg-[#0D0F12] border border-white/[0.06] text-[11px] font-mono-num text-slate-300">
                        {section.unlockedInCollection} / {section.allInCollection.length}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold ${setReward.badgeStyleClass}`}
                      >
                        <Award className="w-3 h-3" />
                        <span>{setReward.badgeTitle}</span>
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Бонус за весь сет:{' '}
                      <span className="font-mono-num font-bold text-[#FACC15]">
                        +{formatTC(setReward.rewardTc)} TC
                      </span>{' '}
                      ·{' '}
                      <span className="font-mono-num font-bold text-emerald-300">
                        +{setReward.rewardXp} XP
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-xs font-mono-num text-slate-400">
                      Опыт коллекции:{' '}
                      <span className="text-[#FACC15] font-bold">
                        {section.earnedCollectionXp}
                      </span>{' '}
                      / {section.totalCollectionXp} XP
                    </div>

                    {isAuthorized && setReward.isComplete && !setReward.isClaimed && onClaimCollectionReward && (
                      <button
                        type="button"
                        disabled={isBusy}
                        data-testid={`claim-set-${section.collectionName}`}
                        onClick={() => handleClaim(section.collectionName)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] text-xs font-display font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-[0_0_16px_rgba(250,204,21,0.25)]"
                      >
                        <Gift className="w-3.5 h-3.5" />
                        <span>{isBusy ? 'Начисляем...' : 'Забрать бонус сета'}</span>
                      </button>
                    )}

                    {isAuthorized && setReward.isComplete && setReward.isClaimed && onEquipBadge && (
                      <button
                        type="button"
                        disabled={isBusy}
                        data-testid={`equip-badge-${section.collectionName}`}
                        onClick={() => handleToggleEquip(section.collectionName, isEquipped)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-50 ${
                          isEquipped
                            ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300 hover:bg-emerald-500/25'
                            : 'bg-[#0D0F12] border-white/[0.1] text-slate-200 hover:border-[#FACC15]/40 hover:text-[#FACC15]'
                        }`}
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>{isEquipped ? 'Бейдж надет ✓' : 'Надеть бейдж'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {section.visibleCards.map((item) => (
                    <DiaryCardTile
                      key={item.id}
                      item={item}
                      unlocked={unlockedSet.has(item.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
