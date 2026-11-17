import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  Check,
  Coins,
  Crown,
  Flag,
  Hand,
  Layers,
  LockKeyhole,
  Play,
  Shield,
  Timer,
  Users,
  XCircle,
} from 'lucide-react';
import type { DurakCard as DurakCardType, DurakRoomProjection, FriendSummary, UserProfile } from '../types';
import { formatTC } from '../utils/economics';
import { DURAK_SUIT_META, formatDurakCardShort, getDurakRankLabel } from '../utils/durakDeck';
import { DurakCard, DurakCardBack, DurakSuitBadge } from './DurakCard';
import { LoadingOverlay } from './LoadingOverlay';

interface DurakTableProps {
  room: DurakRoomProjection;
  user: UserProfile;
  friends: FriendSummary[];
  busyAction: boolean;
  onAction: (action: { type: 'attack' | 'defend' | 'transfer' | 'pass' | 'take'; cardId?: string; pairIndex?: number }) => Promise<void>;
  onInviteFriend: (friendId: string) => Promise<void>;
  onStartEarly: () => Promise<void>;
  onCancelRoom: () => Promise<void>;
  onLeaveWaitingRoom: () => Promise<void>;
  onForfeit: () => Promise<void>;
  onDismissCompleted: () => void;
  onOpenDeck?: () => void;
}

function canBeatClient(attack: DurakCardType, defense: DurakCardType, trumpSuit: DurakRoomProjection['trumpSuit']): boolean {
  if (defense.suit === attack.suit) return defense.rank > attack.rank;
  if (trumpSuit && defense.suit === trumpSuit && attack.suit !== trumpSuit) return true;
  return false;
}

export const DurakTable: React.FC<DurakTableProps> = ({
  room,
  user,
  friends,
  busyAction,
  onAction,
  onInviteFriend,
  onStartEarly,
  onCancelRoom,
  onLeaveWaitingRoom,
  onForfeit,
  onDismissCompleted,
  onOpenDeck,
}) => {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [inviteFriendId, setInviteFriendId] = useState('');
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [riffleKey, setRiffleKey] = useState(0);
  const [drawBurst, setDrawBurst] = useState<{ key: number; count: number } | null>(null);
  const [bitoPulseKey, setBitoPulseKey] = useState(0);
  const [freshHandIds, setFreshHandIds] = useState<Set<string>>(() => new Set());
  const [freshTableIds, setFreshTableIds] = useState<Set<string>>(() => new Set());

  const prevDeckRef = useRef<{ roomId: string; status: string; deckCount: number; discardCount: number } | null>(null);
  const prevHandIdsRef = useRef<Set<string>>(new Set());
  const prevTableCardIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setSelectedCardId(null);
    setConfirmForfeit(false);
  }, [room.id, room.table.length, room.attackerIndex, room.defenderIndex, room.phase, room.status]);

  useEffect(() => {
    const prev = prevDeckRef.current;
    const isSameRoom = prev?.roomId === room.id;

    if (room.status === 'playing') {
      const justStartedDealing = !isSameRoom || prev?.status === 'waiting';
      const deckDropped = isSameRoom && prev.status === 'playing' && room.deckCount < prev.deckCount;
      if (justStartedDealing || deckDropped) {
        const delta = justStartedDealing ? 3 : prev ? prev.deckCount - room.deckCount : 1;
        const burstCount = Math.max(1, Math.min(3, delta));
        setDrawBurst({ key: Date.now(), count: burstCount });
      }
      if (isSameRoom && room.discardCount > prev.discardCount) {
        setBitoPulseKey((k) => k + 1);
      }
    }

    prevDeckRef.current = {
      roomId: room.id,
      status: room.status,
      deckCount: room.deckCount,
      discardCount: room.discardCount,
    };
  }, [room.id, room.status, room.deckCount, room.discardCount]);

  useEffect(() => {
    if (!drawBurst) return;
    const timer = window.setTimeout(() => setDrawBurst(null), 780);
    return () => window.clearTimeout(timer);
  }, [drawBurst]);

  useEffect(() => {
    const currentHandIds = new Set(room.myHand.map((c) => c.id));
    const newlyAdded = new Set<string>();
    for (const id of currentHandIds) {
      if (!prevHandIdsRef.current.has(id)) newlyAdded.add(id);
    }
    prevHandIdsRef.current = currentHandIds;
    if (newlyAdded.size > 0) {
      setFreshHandIds(newlyAdded);
      const t = window.setTimeout(() => setFreshHandIds(new Set()), 650);
      return () => window.clearTimeout(t);
    }
  }, [room.myHand, room.id]);

  useEffect(() => {
    const currentTableIds = new Set<string>();
    for (const p of room.table) {
      currentTableIds.add(p.attack.id);
      if (p.defense) currentTableIds.add(p.defense.id);
    }
    const newlyPlayed = new Set<string>();
    for (const id of currentTableIds) {
      if (!prevTableCardIdsRef.current.has(id)) newlyPlayed.add(id);
    }
    prevTableCardIdsRef.current = currentTableIds;
    if (newlyPlayed.size > 0) {
      setFreshTableIds(newlyPlayed);
      const t = window.setTimeout(() => setFreshTableIds(new Set()), 450);
      return () => window.clearTimeout(t);
    }
  }, [room.table, room.id]);

  useEffect(() => {
    if (room.status !== 'playing' || !room.turnDeadlineAt) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [room.status, room.turnDeadlineAt]);

  const mySeatIndex = room.players.findIndex((p) => p.userId === user.id);
  const myPlayer = mySeatIndex >= 0 ? room.players[mySeatIndex] : undefined;
  const isHost = room.hostUserId === user.id;
  const isDefender = mySeatIndex === room.defenderIndex;
  const isPrimaryAttacker = mySeatIndex === room.attackerIndex;
  const isMyFinished = myPlayer?.finishedRank !== null;

  const opponents = useMemo(() => {
    if (mySeatIndex < 0) return room.players;
    const ordered = [];
    for (let offset = 1; offset < room.players.length; offset++) {
      ordered.push(room.players[(mySeatIndex + offset) % room.players.length]);
    }
    return ordered;
  }, [room.players, mySeatIndex]);

  const tableRanks = useMemo(() => {
    const ranks = new Set<number>();
    for (const pair of room.table) {
      ranks.add(pair.attack.rank);
      if (pair.defense) ranks.add(pair.defense.rank);
    }
    return ranks;
  }, [room.table]);

  const uncoveredPairs = useMemo(
    () =>
      room.table
        .map((pair, idx) => ({ pair, idx }))
        .filter((entry) => entry.pair.defense === null),
    [room.table]
  );
  const allCovered = room.table.length > 0 && uncoveredPairs.length === 0;
  const defenderPlayer = room.players[room.defenderIndex];
  const canMoreAttackCardsFit =
    room.table.length < 6 &&
    Boolean(defenderPlayer) &&
    uncoveredPairs.length < (defenderPlayer?.cardCount ?? 0);

  const nextActiveSeatAfterDefender = useMemo(() => {
    for (let step = 1; step <= room.players.length; step++) {
      const idx = (room.defenderIndex + step) % room.players.length;
      if (room.players[idx].finishedRank === null) return idx;
    }
    return room.defenderIndex;
  }, [room.players, room.defenderIndex]);

  const canCardTransfer = (card: DurakCardType): boolean => {
    if (room.mode !== 'perevodnoy') return false;
    if (room.status !== 'playing' || room.phase !== 'playing' || !isDefender || isMyFinished) return false;
    if (room.table.length === 0 || room.table.length >= 6) return false;
    if (room.table.some((p) => p.defense !== null)) return false;
    if (card.rank !== room.table[0].attack.rank) return false;
    if (nextActiveSeatAfterDefender === room.defenderIndex) return false;
    return (room.players[nextActiveSeatAfterDefender]?.cardCount ?? 0) >= room.table.length + 1;
  };

  const canCardDefendAny = (card: DurakCardType): boolean => {
    if (room.status !== 'playing' || room.phase !== 'playing' || !isDefender || isMyFinished) return false;
    return uncoveredPairs.some(({ pair }) => canBeatClient(pair.attack, card, room.trumpSuit));
  };

  const canCardAttack = (card: DurakCardType): boolean => {
    if (room.status !== 'playing' || isDefender || isMyFinished) return false;
    if (!canMoreAttackCardsFit) return false;
    if (room.table.length === 0) return isPrimaryAttacker;
    return tableRanks.has(card.rank);
  };

  const isCardPlayable = (card: DurakCardType): boolean =>
    canCardAttack(card) || canCardDefendAny(card) || canCardTransfer(card);

  const selectedCard = room.myHand.find((c) => c.id === selectedCardId) ?? null;
  const selectedCanTransfer = selectedCard ? canCardTransfer(selectedCard) : false;
  const selectedBeatablePairIndices = useMemo(() => {
    if (!selectedCard || !isDefender || room.phase !== 'playing') return new Set<number>();
    return new Set(
      uncoveredPairs
        .filter(({ pair }) => canBeatClient(pair.attack, selectedCard, room.trumpSuit))
        .map(({ idx }) => idx)
    );
  }, [selectedCard, isDefender, room.phase, uncoveredPairs, room.trumpSuit]);

  const secondsLeft = room.turnDeadlineAt ? Math.max(0, Math.ceil((room.turnDeadlineAt - nowMs) / 1000)) : null;

  const canPassOrBito =
    room.status === 'playing' &&
    !isDefender &&
    !isMyFinished &&
    !myPlayer?.passed &&
    room.table.length > 0 &&
    (room.phase === 'taking' || allCovered);

  const canTake =
    room.status === 'playing' &&
    isDefender &&
    !isMyFinished &&
    room.phase === 'playing' &&
    uncoveredPairs.length > 0;

  const handleHandCardClick = async (card: DurakCardType) => {
    if (busyAction || room.status !== 'playing' || isMyFinished) return;

    if (!isDefender) {
      if (canCardAttack(card)) {
        await onAction({ type: 'attack', cardId: card.id });
      }
      return;
    }

    const canDef = canCardDefendAny(card);
    const canTrans = canCardTransfer(card);
    if (!canDef && !canTrans) {
      setSelectedCardId(null);
      return;
    }

    if (canTrans && !canDef) {
      await onAction({ type: 'transfer', cardId: card.id });
      return;
    }

    if (canDef && !canTrans && uncoveredPairs.length === 1) {
      await onAction({ type: 'defend', cardId: card.id, pairIndex: uncoveredPairs[0].idx });
      return;
    }

    setSelectedCardId((prev) => (prev === card.id ? null : card.id));
  };

  const handleTableSlotClick = async (pairIndex: number) => {
    if (busyAction || !selectedCard || !selectedBeatablePairIndices.has(pairIndex)) return;
    await onAction({ type: 'defend', cardId: selectedCard.id, pairIndex });
  };

  // Waiting room before cards are dealt
  if (room.status === 'waiting') {
    const seatedIds = new Set(room.players.map((p) => p.userId));
    const invitableFriends = friends.filter((f) => !seatedIds.has(f.id));
    return (
      <section className="space-y-5 rounded-2xl border border-white/[0.08] bg-[#14161A] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#FACC15]">
              <span>{room.mode === 'perevodnoy' ? 'Переводной дурак' : 'Подкидной дурак'}</span>
              <span className="text-slate-600">•</span>
              <span>Колода 32 карты</span>
              {room.hasPassword && (
                <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-slate-300">
                  <LockKeyhole className="h-3 w-3" /> Закрытый стол
                </span>
              )}
            </div>
            <h2 className="mt-1 font-display text-2xl font-black text-white">
              Ожидание игроков ({room.players.length} / {room.maxPlayers})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {room.stake > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-bold text-[#FACC15]">
                <Coins className="h-3.5 w-3.5" /> Ставка: {formatTC(room.stake)} TC
              </span>
            )}
            {isHost ? (
              <>
                {room.players.length >= 2 && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void onStartEarly()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FACC15] px-4 py-2 text-xs font-extrabold text-[#0B0D10] hover:bg-[#FDE047] cursor-pointer disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" /> Начать с текущим составом
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() => void onCancelRoom()}
                  className="rounded-lg bg-rose-500/15 border border-rose-500/25 px-3.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/25 cursor-pointer disabled:opacity-50"
                >
                  Отменить стол
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void onLeaveWaitingRoom()}
                className="rounded-lg border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.1] cursor-pointer disabled:opacity-50"
              >
                Покинуть стол
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 rounded-xl border border-white/[0.06] bg-[#0D0F12] p-4 md:grid-cols-[minmax(0,1fr)_240px] md:items-center">
          <div className="space-y-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {Array.from({ length: room.maxPlayers }).map((_, idx) => {
                const seated = room.players[idx];
                return seated ? (
                  <div
                    key={seated.userId}
                    className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-3"
                  >
                    {seated.avatarUrl ? (
                      <img src={seated.avatarUrl} alt={seated.username} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full font-display text-sm font-black text-white"
                        style={{ backgroundColor: seated.avatarColor ?? '#2AABEE' }}
                      >
                        {seated.username.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-white">{seated.username}</div>
                      <div className="text-[11px] text-emerald-300">
                        {seated.userId === room.hostUserId ? 'Создатель стола' : `Место #${idx + 1} · Готов`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    key={`empty_${idx}`}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 bg-[#14161A]/60 px-3.5 py-3 text-slate-500"
                  >
                    <Users className="h-5 w-5 shrink-0" />
                    <span className="text-xs font-medium">Свободное место #{idx + 1}</span>
                  </div>
                );
              })}
            </div>

            {isHost && invitableFriends.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <select
                  aria-label="Выбрать друга для приглашения за стол"
                  value={inviteFriendId}
                  onChange={(e) => setInviteFriendId(e.target.value)}
                  className="min-w-[190px] rounded-lg border border-white/10 bg-[#14161A] px-3 py-2 text-sm text-white"
                >
                  <option value="">Пригласить друга за стол…</option>
                  {invitableFriends.map((friend) => (
                    <option key={friend.id} value={friend.id}>
                      {friend.telegramUsername ? `@${friend.telegramUsername}` : friend.username}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!inviteFriendId || busyAction}
                  onClick={() => {
                    const id = inviteFriendId;
                    setInviteFriendId('');
                    void onInviteFriend(id);
                  }}
                  className="rounded-lg bg-[#FACC15] px-4 py-2 text-xs font-extrabold text-[#0B0D10] hover:bg-[#FDE047] disabled:opacity-40 cursor-pointer"
                >
                  Пригласить
                </button>
              </div>
            )}
          </div>

          <LoadingOverlay compact label="Ждём соперников" />
        </div>
      </section>
    );
  }

  // Turn banner & role instruction
  let turnBanner = 'Ожидание хода';
  let turnHighlight = false;
  if (room.status === 'completed') {
    if (room.isDraw) {
      turnBanner = 'Ничья — все карты вышли одновременно!';
    } else if (room.loserUserId === user.id) {
      turnBanner = 'Вы остались в дураках';
    } else {
      turnBanner = 'Вы победили за столом!';
      turnHighlight = true;
    }
  } else if (isMyFinished) {
    turnBanner = 'Вы вышли из раздачи — наблюдайте за финалом';
  } else if (isDefender) {
    if (room.phase === 'taking') {
      turnBanner = 'Вы забираете карты — ждём завершения подкидывания';
    } else if (uncoveredPairs.length > 0) {
      turnBanner = room.mode === 'perevodnoy' && !room.table.some((p) => p.defense !== null)
        ? 'Ваш ход: отбейте карты или переведите дальше'
        : 'Ваш ход: отбейте открытые карты или нажмите «Взять»';
      turnHighlight = true;
    } else {
      turnBanner = 'Отбито! Ждём подкидывания или «Бито»';
    }
  } else if (room.table.length === 0) {
    if (isPrimaryAttacker) {
      turnBanner = 'Ваш ход: выберите первую карту для атаки';
      turnHighlight = true;
    } else {
      turnBanner = `Ходит ${room.players[room.attackerIndex]?.username ?? 'соперник'}`;
    }
  } else if (room.phase === 'taking') {
    turnBanner = myPlayer?.passed
      ? 'Вы нажали «Пас» — ждём остальных'
      : 'Соперник берёт: подкиньте карту по рангу или нажмите «Пусть берёт»';
    turnHighlight = !myPlayer?.passed;
  } else if (allCovered) {
    turnBanner = myPlayer?.passed
      ? 'Вы нажали «Бито» — ждём остальных'
      : 'Всё отбито: подкиньте карту по рангу или нажмите «Бито»';
    turnHighlight = !myPlayer?.passed;
  } else {
    turnBanner = `Отбивается ${defenderPlayer?.username ?? 'защитник'}…`;
  }

  return (
    <section
      data-testid="durak-table-active"
      data-durak-status={room.status}
      className="relative overflow-hidden rounded-2xl border border-amber-300/20 bg-[#0D0F12] shadow-2xl"
    >
      {/* Top Info Chrome */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0D0F12] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/25 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-emerald-300">
            {room.mode === 'perevodnoy' ? 'Переводной' : 'Подкидной'}
          </span>
          {room.trumpSuit && <DurakSuitBadge suit={room.trumpSuit} />}
          {room.pot > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-xs font-bold font-mono-num text-[#FACC15]">
              <Coins className="h-3.5 w-3.5" /> Банк: {formatTC(room.pot)} TC
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {secondsLeft !== null && room.status === 'playing' && (
            <span
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold font-mono-num ${
                secondsLeft <= 10
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                  : 'border-white/10 bg-white/[0.04] text-slate-300'
              }`}
            >
              <Timer className="h-3.5 w-3.5" /> {secondsLeft}с
            </span>
          )}
          {onOpenDeck && (
            <button
              type="button"
              onClick={onOpenDeck}
              aria-label="Открыть колоду 32 карт"
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-white/[0.09] hover:text-white cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5 text-[#FACC15]" />
              <span className="hidden sm:inline">Колода 32</span>
            </button>
          )}
          {room.status === 'playing' && (
            confirmForfeit ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() => void onForfeit()}
                  className="rounded-lg bg-rose-500 px-2.5 py-1 text-xs font-bold text-white cursor-pointer"
                >
                  Подтвердить сдачу
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmForfeit(false)}
                  className="rounded-lg border border-white/15 px-2 py-1 text-xs text-slate-300 cursor-pointer"
                >
                  Нет
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmForfeit(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-rose-500/15 hover:text-rose-300 cursor-pointer"
              >
                <Flag className="h-3.5 w-3.5" /> Сдаться
              </button>
            )
          )}
        </div>
      </div>

      {/* Main Emerald Felt Surface */}
      <div
        className="relative flex flex-col justify-between gap-3.5 sm:gap-5 px-3 py-4 sm:px-6 sm:py-6 min-h-[440px] sm:min-h-[520px]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, #14523E 0%, #0F3D2E 58%, #09271D 100%)',
        }}
      >
        {/* Top Zone: Opponents */}
        <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-5">
          {opponents.map((opp) => {
            const oppIsAttacker = room.players[room.attackerIndex]?.userId === opp.userId;
            const oppIsDefender = room.players[room.defenderIndex]?.userId === opp.userId;
            const shownBacks = Math.min(8, opp.cardCount);
            const roleLabel =
              opp.finishedRank !== null
                ? `Вышел #${opp.finishedRank}`
                : oppIsDefender
                ? room.phase === 'taking'
                  ? 'Берёт карты'
                  : 'Отбивается'
                : oppIsAttacker
                ? 'Атакует'
                : opp.passed
                ? 'Пас / Бито'
                : 'Подкидывает';
            return (
              <div
                key={opp.userId}
                className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-2.5 backdrop-blur-sm ${
                  oppIsDefender || oppIsAttacker
                    ? 'border-[#FACC15]/40 bg-[#0B0D10]/70'
                    : 'border-white/15 bg-[#0B0D10]/55'
                }`}
              >
                <div className="flex items-center gap-2">
                  {opp.avatarUrl ? (
                    <img src={opp.avatarUrl} alt={opp.username} className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white"
                      style={{ backgroundColor: opp.avatarColor ?? '#2AABEE' }}
                    >
                      {opp.username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <div className="text-xs font-bold text-white leading-tight">{opp.username}</div>
                    <div className="text-[10px] font-semibold text-amber-200/90">
                      {roleLabel} · <span className="font-mono-num">{opp.cardCount} карт.</span>
                    </div>
                  </div>
                </div>
                {opp.cardCount > 0 && (
                  <div className="flex items-center justify-center -space-x-4">
                    {Array.from({ length: shownBacks }).map((_, bIdx) => (
                      <DurakCardBack key={bIdx} size="xs" />
                    ))}
                    {opp.cardCount > shownBacks && (
                      <span className="ml-5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono-num font-bold text-amber-300">
                        +{opp.cardCount - shownBacks}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Center Zone: Card Bouts + Right Deck & Trump Stack */}
        <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_170px]">
          {/* Active Table Pairs */}
          <div className="flex min-h-[168px] flex-wrap items-center justify-center gap-3 sm:gap-5 rounded-2xl border border-white/[0.09] bg-black/20 px-4 py-5">
            {room.table.length === 0 ? (
              <div className="text-center text-sm text-emerald-100/65">
                {room.status === 'playing'
                  ? 'Стол пуст — ждём первую карту атаки'
                  : 'Партия завершена'}
              </div>
            ) : (
              room.table.map((pair, idx) => {
                const isTarget = selectedBeatablePairIndices.has(idx);
                const attackFresh = freshTableIds.has(pair.attack.id);
                const defenseFresh = pair.defense ? freshTableIds.has(pair.defense.id) : false;
                return (
                  <div
                    key={`${pair.attack.id}_${idx}`}
                    className={`relative flex items-start transition-transform ${
                      isTarget ? 'scale-105' : ''
                    } ${attackFresh ? 'durak-table-card-in' : ''}`}
                  >
                    {isTarget ? (
                      <button
                        type="button"
                        onClick={() => void handleTableSlotClick(idx)}
                        aria-label={`Отбить карту ${formatDurakCardShort(pair.attack)}`}
                        className="relative cursor-pointer rounded-xl ring-3 ring-[#FACC15] shadow-[0_0_24px_rgba(250,204,21,0.55)]"
                      >
                        <DurakCard card={pair.attack} size="md" />
                        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#FACC15] px-1.5 py-0.5 text-[10px] font-black text-[#0B0D10]">
                          Отбить
                        </span>
                      </button>
                    ) : (
                      <DurakCard card={pair.attack} size="md" />
                    )}
                    {pair.defense && (
                      <div
                        className={`-ml-11 mt-4 sm:-ml-12 sm:mt-5 rotate-[7deg] drop-shadow-xl ${
                          defenseFresh ? 'durak-defense-card-in' : ''
                        }`}
                      >
                        <DurakCard card={pair.defense} size="md" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Animated Deck Pile, Visible Trump & Discard Stack */}
          <div className="flex flex-row lg:flex-col items-center justify-center gap-4 rounded-xl border border-white/10 bg-[#0B0D10]/60 p-3.5">
            <div
              data-testid="durak-deck-pile"
              className="relative flex items-center justify-center min-w-[126px] min-h-[112px]"
            >
              {room.trumpCard ? (
                <div className="durak-trump-peek relative">
                  <DurakCard card={room.trumpCard} size="sm" rotated />
                  {/* Upright rank + suit chip on the peeking trump edge so it stays crisp even rotated under the deck */}
                  <span
                    aria-label={`Козырная карта ${formatDurakCardShort(room.trumpCard)}`}
                    className={`pointer-events-none absolute -right-2.5 -top-1.5 z-10 inline-flex items-center gap-0.5 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-display text-[11px] font-black leading-none shadow-md ${
                      DURAK_SUIT_META[room.trumpCard.suit].isRed ? 'text-[#DC2626]' : 'text-[#111827]'
                    }`}
                  >
                    <span>{getDurakRankLabel(room.trumpCard.rank)}</span>
                    <span>{DURAK_SUIT_META[room.trumpCard.suit].symbol}</span>
                  </span>
                </div>
              ) : (
                <div className="flex h-[78px] w-[58px] flex-col items-center justify-center rounded-lg border border-dashed border-white/25 bg-black/30 text-center">
                  <span
                    className={`text-2xl font-black ${
                      room.trumpSuit && DURAK_SUIT_META[room.trumpSuit].isRed ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {room.trumpSuit ? DURAK_SUIT_META[room.trumpSuit].symbol : '•'}
                  </span>
                  <span className="text-[9px] text-slate-400">Пусто</span>
                </div>
              )}

              {room.deckCount > 1 && (
                <button
                  type="button"
                  onClick={() => setRiffleKey((k) => k + 1)}
                  aria-label={`Колода: осталось ${room.deckCount} карт`}
                  title="Нажмите, чтобы встряхнуть колоду"
                  className="group absolute left-3 z-10 flex items-center justify-center bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FACC15] rounded-lg"
                >
                  {/* Layered physical deck thickness matching remaining cards */}
                  {(() => {
                    const stackLayers = Math.min(4, Math.max(1, Math.ceil((room.deckCount - 1) / 5)));
                    return (
                      <div
                        key={`stack_${riffleKey}_${drawBurst?.key ?? 0}`}
                        className={`relative transition-transform duration-200 group-hover:-translate-y-1 ${
                          drawBurst
                            ? 'durak-deck-recoil'
                            : riffleKey > 0
                            ? 'durak-deck-riffle'
                            : 'durak-deck-float'
                        }`}
                      >
                        {Array.from({ length: stackLayers }).map((_, lIdx) => {
                          const offset = (stackLayers - lIdx) * 2;
                          return (
                            <div
                              key={lIdx}
                              aria-hidden="true"
                              style={{ transform: `translate(${-offset}px, ${offset}px)` }}
                              className="absolute inset-0 rounded-lg border border-amber-200/20 bg-[#0A261C] shadow-sm"
                            />
                          );
                        })}
                        <div className="relative">
                          <DurakCardBack size="sm" shimmer />
                          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/85 px-2 py-0.5 font-mono-num text-xs font-black text-[#FACC15] border border-amber-300/35 shadow">
                            {room.deckCount}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </button>
              )}

              {/* Flying card draw animations when cards leave the deck */}
              {drawBurst && (
                <div
                  key={`draw_burst_${drawBurst.key}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 z-20"
                >
                  {Array.from({ length: drawBurst.count }).map((_, idx) => (
                    <div
                      key={idx}
                      style={{ '--draw-delay': `${idx * 95}ms` } as React.CSSProperties}
                      className={`absolute inset-0 ${
                        idx % 2 === 0 ? 'durak-draw-fly-down' : 'durak-draw-fly-up'
                      }`}
                    >
                      <DurakCardBack size="sm" />
                    </div>
                  ))}
                </div>
              )}

              {room.deckCount === 1 && (
                <span className="absolute -top-1 left-2 z-10 rounded-md bg-black/85 px-1.5 py-0.5 font-mono-num text-[11px] font-black text-[#FACC15] border border-amber-300/30">
                  1 (козырь)
                </span>
              )}
            </div>

            <div className="flex flex-col items-center gap-1.5 text-center text-xs">
              <div className="inline-flex items-center gap-1 font-semibold text-slate-300">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                <span>В колоде:</span>
                <b className="font-mono-num text-white">{room.deckCount}</b>
              </div>
              <div
                key={`bito_${bitoPulseKey}`}
                className={`inline-flex items-center gap-1.5 text-[11px] text-slate-400 ${
                  bitoPulseKey > 0 ? 'durak-bito-pulse' : ''
                }`}
              >
                {room.discardCount > 0 && (
                  <span className="inline-flex -space-x-2" aria-hidden="true">
                    <span className="h-4 w-3 rounded-[2px] border border-amber-300/30 bg-[#0B2D22] -rotate-6" />
                    <span className="h-4 w-3 rounded-[2px] border border-amber-300/40 bg-[#124232] rotate-6" />
                  </span>
                )}
                <span>
                  Бито: <b className="font-mono-num text-emerald-300">{room.discardCount}</b>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Zone: Turn Status + Actions + My Hand */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-[#0D0F12]/90 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-bold ${turnHighlight ? 'text-[#FACC15]' : 'text-white'}`}>
                {turnBanner}
              </div>
              {room.lastActionText && (
                <div className="mt-0.5 truncate text-xs text-slate-400">{room.lastActionText}</div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedCard && isDefender && room.phase === 'playing' && (
                <>
                  {selectedCanTransfer && (
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void onAction({ type: 'transfer', cardId: selectedCard.id })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#FACC15] px-3.5 py-2 text-xs font-black text-[#0B0D10] hover:bg-[#FDE047] cursor-pointer"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Перевести ({getDurakRankLabel(selectedCard.rank)})
                    </button>
                  )}
                  {selectedBeatablePairIndices.size > 0 && uncoveredPairs.length === 1 && (
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() =>
                        void onAction({
                          type: 'defend',
                          cardId: selectedCard.id,
                          pairIndex: uncoveredPairs[0].idx,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400 cursor-pointer"
                    >
                      <Shield className="h-3.5 w-3.5" /> Отбить
                    </button>
                  )}
                </>
              )}

              {canTake && (
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() => void onAction({ type: 'take' })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/20 border border-rose-400/40 px-4 py-2 text-xs font-extrabold text-rose-200 hover:bg-rose-500/30 cursor-pointer disabled:opacity-50"
                >
                  <Hand className="h-3.5 w-3.5" /> Взять
                </button>
              )}

              {canPassOrBito && (
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() => void onAction({ type: 'pass' })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#FACC15] px-4 py-2 text-xs font-black text-[#0B0D10] hover:bg-[#FDE047] cursor-pointer disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> {room.phase === 'taking' ? 'Пусть берёт (Пас)' : 'Бито'}
                </button>
              )}
            </div>
          </div>

          {/* Player's Hand of White Photo Cards */}
          {myPlayer && (
            <div
              data-testid="durak-my-hand"
              className="flex items-end justify-start sm:justify-center overflow-x-auto pb-2 pt-4 px-2"
            >
              {room.myHand.length === 0 ? (
                <div className="py-6 text-xs font-medium text-emerald-100/70">
                  У вас не осталось карт на руках.
                </div>
              ) : (
                <div className="flex items-end -space-x-3 sm:-space-x-2">
                  {room.myHand.map((card, idx) => {
                    const playable = isCardPlayable(card);
                    const isFresh = freshHandIds.has(card.id);
                    return (
                      <div
                        key={card.id}
                        style={isFresh ? ({ '--deal-delay': `${idx * 45}ms` } as React.CSSProperties) : undefined}
                        className={`shrink-0 ${isFresh ? 'durak-hand-card-in' : ''}`}
                      >
                        <DurakCard
                          card={card}
                          size="md"
                          selected={selectedCardId === card.id}
                          playable={playable}
                          disabled={room.status !== 'playing' || !playable}
                          onClick={() => void handleHandCardClick(card)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Completed Match Result Overlay */}
      {room.status === 'completed' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Итог партии в Дурака"
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-modal-backdrop"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-300/30 bg-[#14161A] p-6 text-center shadow-2xl animate-modal-panel">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-300/15 text-[#FACC15]">
              {room.loserUserId === user.id ? <XCircle className="h-8 w-8 text-rose-400" /> : <Crown className="h-8 w-8" />}
            </div>

            <div>
              <h3 className="font-display text-2xl font-black text-white">
                {room.isDraw
                  ? 'Ничья!'
                  : room.loserUserId === user.id
                  ? 'Вы остались в дураках'
                  : 'Победа в Дураке!'}
              </h3>
              <p className="mt-1 text-sm text-slate-300">{room.lastActionText}</p>
            </div>

            {room.pot > 0 && (
              <div className="rounded-xl border border-white/[0.08] bg-[#0D0F12] px-4 py-3 text-sm">
                {room.isDraw ? (
                  <span className="text-slate-200">
                    Ставка возвращена: <b className="font-mono-num text-[#FACC15]">{formatTC(room.payoutPerWinner)} TC</b>
                  </span>
                ) : room.winnerUserIds.includes(user.id) ? (
                  <span className="text-emerald-300 font-bold">
                    Ваш выигрыш: +{formatTC(room.payoutPerWinner)} TC
                  </span>
                ) : (
                  <span className="text-rose-300">
                    Ставка {formatTC(room.stake)} TC ушла победителям
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onDismissCompleted}
              className="w-full rounded-xl bg-[#FACC15] px-5 py-3 text-sm font-black text-[#0B0D10] hover:bg-[#FDE047] cursor-pointer"
            >
              Вернуться в лобби игр
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
