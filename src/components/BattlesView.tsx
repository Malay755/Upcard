import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Swords, Shield, Users, Coins, LockKeyhole, Trophy, RefreshCw } from 'lucide-react';
import type { BattleInvitationSummary, BattleMode, BattleRoomSummary, BootstrapPayload, CaseBox, FriendSummary, ItemCard, UserProfile } from '../types';
import { formatTC } from '../utils/economics';
import { CardFrame } from './CardFrame';
import { CaseThumbnail3D } from './CaseThumbnail3D';
import { BattleCaseLane, BATTLE_CASE_ROUND_MS } from './BattleCaseLane';
import { BattleUpgradeWheel } from './BattleUpgradeWheel';
import { BattleWinnerOverlay } from './BattleWinnerOverlay';
import { LoadingOverlay } from './LoadingOverlay';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие.');
  return data as T;
}

function readStoredIdList(storageKey: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function appendStoredId(storageKey: string, roomId: string): void {
  if (typeof window === 'undefined' || !roomId) return;
  try {
    const existing = readStoredIdList(storageKey).filter((id) => id !== roomId);
    existing.push(roomId);
    window.localStorage.setItem(storageKey, JSON.stringify(existing.slice(-50)));
  } catch {
    /* Ignore storage quota errors in restricted WebViews. */
  }
}

const getSeenWinnerKey = (userId: string) => `farm_seen_battle_winner:${userId || 'guest'}`;
const getDismissedRoomKey = (userId: string) => `farm_dismissed_battle_room:${userId || 'guest'}`;

const hasSeenBattleWinner = (userId: string, roomId: string) => readStoredIdList(getSeenWinnerKey(userId)).includes(roomId);
const markBattleWinnerSeen = (userId: string, roomId: string) => appendStoredId(getSeenWinnerKey(userId), roomId);
const hasDismissedBattleRoom = (userId: string, roomId: string) => readStoredIdList(getDismissedRoomKey(userId)).includes(roomId);
const markBattleRoomDismissed = (userId: string, roomId: string) => appendStoredId(getDismissedRoomKey(userId), roomId);

interface Props {
  user: UserProfile;
  items: ItemCard[];
  cases: CaseBox[];
  friends: FriendSummary[];
  invitations: BattleInvitationSummary[];
  isAuthorized: boolean;
  battleSyncKey?: number;
  onOpenTelegramLogin: () => void;
  onEnableNotifications: () => void;
  onSellItems: (ids: string[]) => Promise<void>;
  onPayload: (payload: BootstrapPayload) => void;
  onRefreshPayload?: () => Promise<void>;
}

export const BattlesView: React.FC<Props> = ({
  user,
  items,
  cases,
  friends,
  invitations,
  isAuthorized,
  battleSyncKey = 0,
  onOpenTelegramLogin,
  onEnableNotifications,
  onSellItems,
  onPayload,
  onRefreshPayload,
}) => {
  const [mode, setMode] = useState<BattleMode>('cases');
  const [caseId, setCaseId] = useState(cases[0]?.id ?? '');
  const [caseCount, setCaseCount] = useState(1);
  const [caseCountDraft, setCaseCountDraft] = useState('1');
  const [password, setPassword] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inviteFriendId, setInviteFriendId] = useState('');
  const [rooms, setRooms] = useState<BattleRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<BattleRoomSummary | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selling, setSelling] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [winnerDismissed, setWinnerDismissed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [passwordPromptRoom, setPasswordPromptRoom] = useState<BattleRoomSummary | null>(null);
  const [passwordPromptInput, setPasswordPromptInput] = useState('');

  const playbackOriginByRoomRef = useRef<Map<string, number>>(new Map());
  const dismissedCompletedRoomsRef = useRef<Set<string>>(new Set());
  const roomFetchSeqRef = useRef(0);

  const syncPlaybackOrigin = useCallback((room: BattleRoomSummary | null) => {
    if (!room || room.status !== 'completed' || !room.startedAt) return;
    if (playbackOriginByRoomRef.current.has(room.id)) return;
    const age = Date.now() - room.startedAt;
    // Live round-0 transition: offset 140ms ahead so dual WebGL stages pre-compile shaders before lid drop
    const origin = age >= -500 && age < 2500 ? Math.max(room.startedAt, Date.now() + 140) : room.startedAt;
    playbackOriginByRoomRef.current.set(room.id, origin);
  }, []);

  const mergeActiveRoom = useCallback(
    (next: BattleRoomSummary | null) => {
      syncPlaybackOrigin(next);
      setActiveRoom((prev) => {
        if (!next) return null;
        if (prev && prev.id === next.id && prev.status === 'completed' && next.status === 'waiting') {
          return prev;
        }
        return next;
      });
    },
    [syncPlaybackOrigin]
  );

  const updateCaseCount = (next: number) => {
    const clamped = Math.min(25, Math.max(1, Math.round(next) || 1));
    setCaseCount(clamped);
    setCaseCountDraft(String(clamped));
  };

  const selectedValue = useMemo(
    () => user.inventory.filter((entry) => selectedIds.includes(entry.instanceId)).reduce((sum, entry) => sum + (items.find((item) => item.id === entry.itemId)?.price ?? 0), 0),
    [user.inventory, items, selectedIds]
  );
  const selectedCase = cases.find((entry) => entry.id === caseId);
  const inventory = user.inventory
    .map((entry) => ({ entry, item: items.find((card) => card.id === entry.itemId) }))
    .filter((row): row is { entry: UserProfile['inventory'][number]; item: ItemCard } => Boolean(row.item));

  const refreshRooms = useCallback(async () => {
    try {
      const result = await request<{ battles: BattleRoomSummary[] }>('/api/battles');
      setRooms(result.battles);
    } catch {
      /* Keep the latest list on a transient network interruption. */
    }
  }, []);

  useEffect(() => {
    void refreshRooms();
    if (isAuthorized) {
      void onRefreshPayload?.();
      const seq = ++roomFetchSeqRef.current;
      void request<{ battle: BattleRoomSummary | null }>('/api/battles/current')
        .then((result) => {
          if (seq !== roomFetchSeqRef.current) return;
          const b = result.battle;
          if (!b) return;
          if (b.status === 'completed' && (dismissedCompletedRoomsRef.current.has(b.id) || hasDismissedBattleRoom(user.id, b.id))) {
            return;
          }
          const alreadyShown = b.status === 'completed' && hasSeenBattleWinner(user.id, b.id);
          setWinnerDismissed(alreadyShown);
          mergeActiveRoom(b);
        })
        .catch(() => undefined);
    }
    const timer = window.setInterval(refreshRooms, 2500);
    return () => window.clearInterval(timer);
  }, [isAuthorized, user.id, refreshRooms, mergeActiveRoom, onRefreshPayload]);

  // Trigger immediate room & activeRoom sync whenever WebSocket emits battle events
  useEffect(() => {
    if (battleSyncKey <= 0) return;
    void refreshRooms();
    if (activeRoom?.id && activeRoom.status === 'waiting') {
      const seq = ++roomFetchSeqRef.current;
      void request<{ battle: BattleRoomSummary }>(`/api/battles/${encodeURIComponent(activeRoom.id)}`)
        .then((res) => {
          if (seq !== roomFetchSeqRef.current) return;
          mergeActiveRoom(res.battle);
        })
        .catch(() => undefined);
    }
  }, [battleSyncKey, activeRoom?.id, activeRoom?.status, refreshRooms, mergeActiveRoom]);

  // Poll waiting active room for opponent join
  useEffect(() => {
    if (!activeRoom || activeRoom.status !== 'waiting') return;
    const update = async () => {
      const seq = ++roomFetchSeqRef.current;
      try {
        const result = await request<{ battle: BattleRoomSummary }>(`/api/battles/${encodeURIComponent(activeRoom.id)}`);
        if (seq !== roomFetchSeqRef.current) return;
        mergeActiveRoom(result.battle);
      } catch (e) {
        if (seq !== roomFetchSeqRef.current) return;
        setError(e instanceof Error ? e.message : 'Комната недоступна.');
        setActiveRoom(null);
      }
    };
    void update();
    const timer = window.setInterval(update, 900);
    return () => window.clearInterval(timer);
  }, [activeRoom?.id, activeRoom?.status, mergeActiveRoom]);

  // Lightweight playback ticker ONLY while completed battle rounds are actively animating
  useEffect(() => {
    if (!activeRoom || activeRoom.status !== 'completed') return;
    syncPlaybackOrigin(activeRoom);
    const origin = playbackOriginByRoomRef.current.get(activeRoom.id) ?? activeRoom.startedAt ?? Date.now();
    const duration = activeRoom.durationMs ?? BATTLE_CASE_ROUND_MS;
    if (Date.now() - origin >= duration + 200) {
      setNowMs(Date.now());
      return;
    }
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (now - origin >= duration + 250) {
        window.clearInterval(timer);
      }
    }, 220);
    return () => window.clearInterval(timer);
  }, [activeRoom?.id, activeRoom?.status, activeRoom?.durationMs, activeRoom?.startedAt, syncPlaybackOrigin]);

  useEffect(() => {
    if (!activeRoom?.id) {
      setWinnerDismissed(false);
      return;
    }
    setWinnerDismissed(activeRoom.status === 'completed' && hasSeenBattleWinner(user.id, activeRoom.id));
  }, [activeRoom?.id, activeRoom?.status, user.id]);

  // Pre-decode all card images in active case drop pool while waiting/starting so reels never decode PNGs mid-frame
  const activeCase = cases.find((box) => box.id === activeRoom?.caseId);
  const caseDropPool = useMemo(
    () => activeCase?.itemIds.map((id) => items.find((item) => item.id === id)).filter((item): item is ItemCard => Boolean(item)) ?? [],
    [activeCase, items]
  );

  useEffect(() => {
    if (!activeRoom || caseDropPool.length === 0) return;
    for (const card of caseDropPool) {
      if (!card.imageUrl) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = card.imageUrl;
    }
  }, [activeRoom?.id, caseDropPool]);

  const run = async (actionId: string, action: () => Promise<void>) => {
    if (busyActionId) return;
    setError('');
    setNotice('');
    setBusyActionId(actionId);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка.');
    } finally {
      setBusyActionId(null);
    }
  };

  const createRoom = () =>
    run('create', async () => {
      const result = await request<{ battle: BattleRoomSummary; payload: BootstrapPayload }>('/api/battles', {
        method: 'POST',
        body: JSON.stringify({ mode, caseId, caseCount, password, stakeItemIds: selectedIds }),
      });
      roomFetchSeqRef.current += 1;
      mergeActiveRoom(result.battle);
      setPassword('');
      setSelectedIds([]);
      onPayload(result.payload);
      await refreshRooms();
    });

  const joinRoom = (room: BattleRoomSummary, roomPassword = '') => {
    if (room.mode === 'upgrade' && selectedIds.length === 0) {
      if (activeRoom?.status === 'completed') {
        dismissedCompletedRoomsRef.current.add(activeRoom.id);
        markBattleRoomDismissed(user.id, activeRoom.id);
        setActiveRoom(null);
      }
      setMode('upgrade');
      setNotice('Сначала выбери карточки для ставки ниже и нажми «Принять» снова.');
      return;
    }
    if (room.mode === 'cases') {
      const needed = (cases.find((box) => box.id === room.caseId)?.price ?? 0) * (room.caseCount ?? 1);
      if (user.balance < needed) {
        setError(`Недостаточно TC для входа в комнату (нужно ${formatTC(needed)} TC). Зайди в «Заработать TC»!`);
        return;
      }
    }
    void run(`join:${room.id}`, async () => {
      try {
        const result = await request<{ battle: BattleRoomSummary; payload: BootstrapPayload }>(`/api/battles/${encodeURIComponent(room.id)}/join`, {
          method: 'POST',
          body: JSON.stringify({ password: roomPassword, stakeItemIds: selectedIds }),
        });
        roomFetchSeqRef.current += 1;
        onPayload(result.payload);
        mergeActiveRoom(result.battle);
        setSelectedIds([]);
        await refreshRooms();
      } catch (err) {
        await refreshRooms();
        void onRefreshPayload?.();
        throw err;
      }
    });
  };

  const acceptInvite = (invite: BattleInvitationSummary) => {
    if (activeRoom?.status === 'waiting') {
      setError('Сначала отмени свою ожидающую комнату, чтобы принять другое приглашение.');
      return;
    }
    if (invite.mode === 'upgrade' && selectedIds.length === 0) {
      if (activeRoom?.status === 'completed') {
        dismissedCompletedRoomsRef.current.add(activeRoom.id);
        markBattleRoomDismissed(user.id, activeRoom.id);
        setActiveRoom(null);
      }
      setMode('upgrade');
      setError('');
      setNotice(`Для участия в батле апгрейдов с ${invite.fromUsername} выбери карточки для ставки ниже и снова нажми «Принять».`);
      return;
    }
    if (invite.mode === 'cases') {
      const needed = (cases.find((box) => box.id === invite.caseId)?.price ?? 0) * (invite.caseCount ?? 1);
      if (user.balance < needed) {
        setError(`Недостаточно TC для участия (нужно ${formatTC(needed)} TC).`);
        return;
      }
    }

    void run(`accept:${invite.id}`, async () => {
      try {
        const result = await request<{ battle: BattleRoomSummary; payload: BootstrapPayload }>(`/api/battle-invitations/${encodeURIComponent(invite.id)}/accept`, {
          method: 'POST',
          body: JSON.stringify({ stakeItemIds: selectedIds }),
        });
        roomFetchSeqRef.current += 1;
        mergeActiveRoom(result.battle);
        onPayload(result.payload);
        setSelectedIds([]);
        await refreshRooms();
      } catch (err) {
        await refreshRooms();
        void onRefreshPayload?.();
        throw err;
      }
    });
  };

  const declineInvite = (id: string) =>
    run(`decline:${id}`, async () => {
      const result = await request<{ payload: BootstrapPayload }>(`/api/battle-invitations/${encodeURIComponent(id)}`, { method: 'DELETE' });
      onPayload(result.payload);
    });

  const cancelRoom = () =>
    activeRoom &&
    run('cancel', async () => {
      const result = await request<{ payload: BootstrapPayload }>(`/api/battles/${encodeURIComponent(activeRoom.id)}`, { method: 'DELETE' });
      roomFetchSeqRef.current += 1;
      onPayload(result.payload);
      setActiveRoom(null);
      await refreshRooms();
    });

  const inviteFriend = () =>
    activeRoom &&
    run('invite', async () => {
      await request('/api/battles/' + encodeURIComponent(activeRoom.id) + '/invite', {
        method: 'POST',
        body: JSON.stringify({ friendId: inviteFriendId }),
      });
      setInviteFriendId('');
      setNotice('Приглашение отправлено.');
    });

  const sellBattleReward = async () => {
    if (!activeRoom || selling) return;
    const ids = (activeRoom.rewardInventoryIds ?? []).filter((id) => user.inventory.some((entry) => entry.instanceId === id));
    if (!ids.length) {
      setError('Выигранные карточки уже отсутствуют в инвентаре. Обновите страницу.');
      return;
    }
    setSelling(true);
    setError('');
    setNotice('');
    try {
      await onSellItems(ids);
      setNotice(`Продано карточек: ${ids.length}. TC начислены на баланс.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось продать выигрыш.');
    } finally {
      setSelling(false);
    }
  };

  const promptAndJoin = (room: BattleRoomSummary) => {
    if (room.mode === 'upgrade' && selectedIds.length === 0) {
      joinRoom(room, '');
      return;
    }
    if (room.hasPassword) {
      setPasswordPromptInput('');
      setPasswordPromptRoom(room);
      return;
    }
    joinRoom(room, '');
  };

  const playbackStartedAt = activeRoom
    ? playbackOriginByRoomRef.current.get(activeRoom.id) ?? activeRoom.startedAt ?? nowMs
    : nowMs;
  const elapsed = activeRoom?.status === 'completed' ? Math.max(0, nowMs - playbackStartedAt) : 0;
  const progress = activeRoom?.durationMs ? Math.min(1, elapsed / activeRoom.durationMs) : 0;
  const caseCountForRoom = activeRoom?.caseCount ?? activeRoom?.roundResults?.length ?? 1;
  const currentRoundIndex = Math.min(caseCountForRoom - 1, Math.floor(elapsed / BATTLE_CASE_ROUND_MS));
  const visibleRounds = activeRoom?.roundResults?.filter((_, index) => elapsed >= (index + 1) * BATTLE_CASE_ROUND_MS) ?? [];
  const hostDropTotal = visibleRounds.reduce((sum, row) => sum + row.hostDrop.price, 0);
  const guestDropTotal = visibleRounds.reduce((sum, row) => sum + row.guestDrop.price, 0);
  const caseEntryCost = (activeCase?.price ?? 0) * visibleRounds.length;
  const hostNetProfit = hostDropTotal - caseEntryCost;
  const guestNetProfit = guestDropTotal - caseEntryCost;
  const rewardIdsOwned = (activeRoom?.rewardInventoryIds ?? []).filter((id) => user.inventory.some((entry) => entry.instanceId === id));
  const rewardItems = [...(activeRoom?.hostItems ?? []), ...(activeRoom?.guestItems ?? [])]
    .map((entry) => items.find((item) => item.id === entry.itemId))
    .filter((item): item is ItemCard => Boolean(item));
  const topBattleReward = rewardItems.sort((a, b) => b.price - a.price)[0];

  useEffect(() => {
    if (activeRoom?.id && activeRoom.status === 'completed' && progress >= 1) {
      markBattleWinnerSeen(user.id, activeRoom.id);
    }
  }, [activeRoom?.id, activeRoom?.status, progress, user.id]);

  if (!isAuthorized) {
    return (
      <section className="rounded-2xl border border-white/10 bg-[#14161A] p-10 text-center">
        <Swords className="mx-auto mb-3 h-10 w-10 text-amber-300" />
        <h1 className="text-xl font-bold text-white">Батлы игроков</h1>
        <p className="my-3 text-sm text-slate-400">Войди через Telegram, чтобы создавать комнаты и играть с друзьями.</p>
        <button onClick={onOpenTelegramLogin} className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-slate-950 cursor-pointer">
          Войти через Telegram
        </button>
      </section>
    );
  }

  const winnerIsHost = activeRoom?.winnerUserId === activeRoom?.hostUserId;
  const winner = activeRoom?.winnerUserId
    ? {
        username: winnerIsHost ? activeRoom.hostUsername : activeRoom.guestUsername ?? 'Соперник',
        avatarUrl: winnerIsHost ? activeRoom.hostAvatarUrl : activeRoom.guestAvatarUrl,
        avatarColor: winnerIsHost ? activeRoom.hostAvatarColor : activeRoom.guestAvatarColor,
        netProfit: winnerIsHost ? hostNetProfit : guestNetProfit,
      }
    : null;

  return (
    <>
      <div className="space-y-5">
        <section className="rounded-2xl border border-white/[0.07] bg-gradient-to-r from-[#171a20] to-[#111318] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-amber-300/10 p-3 text-amber-300">
                <Swords className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl font-black text-white">Батлы</h1>
                <p className="text-sm text-slate-400">Соревнуйся с другим игроком в кейсах или апгрейдах.</p>
              </div>
            </div>
            {'Notification' in window && Notification.permission === 'default' && (
              <button onClick={onEnableNotifications} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08] cursor-pointer">
                Включить уведомления
              </button>
            )}
          </div>
        </section>

        {invitations.length > 0 && (
          <section className="space-y-2 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-4">
            <h2 className="font-bold text-amber-100">Приглашения в батл ({invitations.length})</h2>
            {invitations.map((invite) => {
              const caseCost = (cases.find((box) => box.id === invite.caseId)?.price ?? 0) * (invite.caseCount ?? 1);
              return (
                <div key={invite.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0D0F12]/80 px-3 py-2.5 text-sm">
                  <div className="flex-1 min-w-[200px]">
                    <span className="text-white font-medium">{invite.fromUsername}</span>{' '}
                    <span className="text-slate-300">
                      зовёт в {invite.mode === 'cases' ? `батл кейсов (${invite.caseCount} · ${formatTC(caseCost)} TC)` : 'батл апгрейдов'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busyActionId === `accept:${invite.id}`}
                    onClick={() => acceptInvite(invite)}
                    className="min-h-[38px] rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 px-3.5 py-1.5 font-bold text-emerald-300 cursor-pointer disabled:opacity-50"
                  >
                    {busyActionId === `accept:${invite.id}` ? 'Вход...' : 'Принять'}
                  </button>
                  <button
                    type="button"
                    disabled={busyActionId === `decline:${invite.id}`}
                    onClick={() => void declineInvite(invite.id)}
                    className="min-h-[38px] rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-400/20 px-3.5 py-1.5 font-bold text-rose-300 cursor-pointer disabled:opacity-50"
                  >
                    Отклонить
                  </button>
                </div>
              );
            })}
          </section>
        )}

        {error && <p role="alert" className="rounded-lg bg-rose-500/10 border border-rose-500/25 p-3 text-sm text-rose-300">{error}</p>}
        {notice && <p role="status" className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 text-sm text-emerald-300">{notice}</p>}

        {activeRoom ? (
          <section className="space-y-4 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-amber-300">
                  {activeRoom.mode === 'cases' ? `Батл кейсов · ${activeRoom.caseCount} открытий` : 'Батл апгрейдов'}
                </div>
                <h2 className="mt-1 text-xl font-bold text-white">
                  {activeRoom.hostUsername} <span className="text-amber-300">VS</span> {activeRoom.guestUsername ?? 'Ожидаем игрока'}
                </h2>
              </div>
              {activeRoom.status === 'waiting' && activeRoom.hostUserId === user.id && (
                <button onClick={() => void cancelRoom()} disabled={busyActionId === 'cancel'} className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 cursor-pointer">
                  Отменить и вернуть ставку
                </button>
              )}
              {activeRoom.status === 'completed' && (
                <button
                  type="button"
                  onClick={() => {
                    dismissedCompletedRoomsRef.current.add(activeRoom.id);
                    markBattleWinnerSeen(user.id, activeRoom.id);
                    markBattleRoomDismissed(user.id, activeRoom.id);
                    setActiveRoom(null);
                    void refreshRooms();
                  }}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08] cursor-pointer"
                >
                  К комнатам
                </button>
              )}
            </div>

            {activeRoom.status === 'waiting' ? (
              <div className="grid gap-4 rounded-xl bg-[#0D0F12] p-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold text-white">Комната готова к батлу</p>
                    <p className="mt-1 text-sm text-slate-400">Ожидаем второго игрока. Батл начнётся автоматически после принятия комнаты.</p>
                  </div>
                  {activeRoom.hostUserId === user.id && friends.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <select value={inviteFriendId} onChange={(event) => setInviteFriendId(event.target.value)} className="min-w-[180px] rounded-lg border border-white/10 bg-[#171a20] px-3 py-2 text-sm text-white">
                        <option value="">Выбери друга</option>
                        {friends.map((friend) => (
                          <option key={friend.id} value={friend.id}>
                            {friend.telegramUsername ? `@${friend.telegramUsername}` : friend.username}
                          </option>
                        ))}
                      </select>
                      <button disabled={!inviteFriendId || busyActionId === 'invite'} onClick={() => void inviteFriend()} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40 cursor-pointer">
                        Пригласить друга
                      </button>
                    </div>
                  )}
                </div>
                <LoadingOverlay compact label="Ожидаем соперника" />
              </div>
            ) : (
              <>
                {activeRoom.status === 'completed' && progress >= 1 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#0D0F12] p-4">
                    <Trophy className="h-5 w-5 text-amber-300" />
                    <span className="font-bold text-white">
                      {activeRoom.winnerUserId
                        ? `Победитель: ${activeRoom.winnerUserId === user.id ? 'Вы' : activeRoom.winnerUserId === activeRoom.hostUserId ? activeRoom.hostUsername : activeRoom.guestUsername}`
                        : 'Ничья — каждый получил свои дропы'}
                    </span>
                    {activeRoom.mode === 'upgrade' && (
                      <span className="text-xs text-slate-400">Шанс {activeRoom.hostUsername}: {activeRoom.hostWinChance?.toFixed(2)}%</span>
                    )}
                    {rewardIdsOwned.length > 0 && (
                      <button
                        type="button"
                        disabled={selling}
                        onClick={() => void sellBattleReward()}
                        className="ml-auto rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300 disabled:cursor-wait disabled:opacity-50 cursor-pointer"
                      >
                        {selling ? 'Продаём…' : `Продать выигрыш · ${rewardIdsOwned.length} карт.`}
                      </button>
                    )}
                  </div>
                )}

                {activeRoom.mode === 'cases' && activeRoom.status === 'completed' && activeCase && activeRoom.roundResults?.[currentRoundIndex] ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <BattleCaseLane
                      playerName={activeRoom.hostUsername}
                      caseBox={activeCase}
                      pool={caseDropPool}
                      drop={activeRoom.roundResults[currentRoundIndex].hostDrop}
                      roundIndex={currentRoundIndex}
                      startedAt={playbackStartedAt}
                    />
                    <BattleCaseLane
                      playerName={activeRoom.guestUsername ?? 'Соперник'}
                      caseBox={activeCase}
                      pool={caseDropPool}
                      drop={activeRoom.roundResults[currentRoundIndex].guestDrop}
                      roundIndex={currentRoundIndex}
                      startedAt={playbackStartedAt}
                    />
                  </div>
                ) : activeRoom.mode === 'upgrade' && activeRoom.status === 'completed' ? (
                  <div className="space-y-4">
                    <BattleUpgradeWheel
                      hostName={activeRoom.hostUsername}
                      guestName={activeRoom.guestUsername ?? 'Соперник'}
                      hostUserId={activeRoom.hostUserId}
                      viewerUserId={user.id}
                      hostChance={activeRoom.hostWinChance ?? 50}
                      rollValue={activeRoom.rollValue ?? 0}
                      winnerName={activeRoom.winnerUserId === activeRoom.hostUserId ? activeRoom.hostUsername : activeRoom.guestUsername ?? '—'}
                      won={activeRoom.winnerUserId === user.id}
                      startedAt={playbackStartedAt}
                      rewardItem={topBattleReward}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <StakePanel label={activeRoom.hostUsername} value={activeRoom.hostStakeValue} items={items} inventory={activeRoom.hostItems ?? []} />
                      <StakePanel label={activeRoom.guestUsername ?? 'Соперник'} value={activeRoom.guestStakeValue} items={items} inventory={activeRoom.guestItems ?? []} />
                    </div>
                  </div>
                ) : null}

                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-gradient-to-r from-amber-300 to-orange-500 transition-[width] duration-300" style={{ width: `${activeRoom.status === 'completed' ? progress * 100 : 0}%` }} />
                </div>

                {activeRoom.mode === 'cases' && activeRoom.status === 'completed' && activeRoom.roundResults && (
                  <div className="space-y-3">
                    <div className="text-right text-xs text-slate-500">{visibleRounds.length} / {activeRoom.caseCount} открытий завершено</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ProfitSummary name={activeRoom.hostUsername} avatarUrl={activeRoom.hostAvatarUrl} avatarColor={activeRoom.hostAvatarColor} isViewer={activeRoom.hostUserId === user.id} caseCount={visibleRounds.length} dropsTotal={hostDropTotal} entryCost={caseEntryCost} netProfit={hostNetProfit} />
                      <ProfitSummary name={activeRoom.guestUsername ?? 'Соперник'} avatarUrl={activeRoom.guestAvatarUrl} avatarColor={activeRoom.guestAvatarColor} isViewer={activeRoom.guestUserId === user.id} caseCount={visibleRounds.length} dropsTotal={guestDropTotal} entryCost={caseEntryCost} netProfit={guestNetProfit} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {visibleRounds.map((row, index) => {
                        const hostRunning = visibleRounds.slice(0, index + 1).reduce((sum, entry) => sum + entry.hostDrop.price, 0) - (activeCase?.price ?? 0) * (index + 1);
                        const guestRunning = visibleRounds.slice(0, index + 1).reduce((sum, entry) => sum + entry.guestDrop.price, 0) - (activeCase?.price ?? 0) * (index + 1);
                        return (
                          <div key={row.round} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 rounded-lg border border-white/[0.04] bg-[#0D0F12] px-3 py-2 text-[11px]">
                            <span className="text-slate-500">#{row.round}</span>
                            <span className="text-amber-200">{formatTC(row.hostDrop.price)} <small className="text-slate-500">· итог {hostRunning >= 0 ? '+' : ''}{formatTC(hostRunning)}</small></span>
                            <span className="text-slate-300">{formatTC(row.guestDrop.price)} <small className="text-slate-500">· итог {guestRunning >= 0 ? '+' : ''}{formatTC(guestRunning)}</small></span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.8fr)_1.2fr]">
            <section className="space-y-4 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5">
              <h2 className="flex items-center gap-2 font-bold text-white">
                <Swords className="h-4 w-4 text-amber-300" /> Создать комнату
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {(['cases', 'upgrade'] as BattleMode[]).map((entry) => (
                  <button
                    key={entry}
                    onClick={() => setMode(entry)}
                    className={`rounded-xl border p-3 text-sm font-bold cursor-pointer ${
                      mode === entry ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-white/10 text-slate-400'
                    }`}
                  >
                    {entry === 'cases' ? 'Батл кейсов' : 'Батл апгрейдов'}
                  </button>
                ))}
              </div>
              {mode === 'cases' ? (
                <>
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400">Выбери кейс</div>
                    <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {cases.map((box) => (
                        <button
                          key={box.id}
                          type="button"
                          onClick={() => setCaseId(box.id)}
                          className={`rounded-xl border p-2 text-left transition-all cursor-pointer ${
                            caseId === box.id
                              ? 'border-amber-300/60 bg-amber-300/[0.08] shadow-[0_0_18px_rgba(250,204,21,0.1)]'
                              : 'border-white/[0.07] bg-[#0D0F12] hover:border-white/20'
                          }`}
                        >
                          <CaseThumbnail3D caseBox={box} className="mx-auto h-[74px] w-full object-contain" />
                          <span className="mt-1 block truncate text-xs font-bold text-white">{box.name}</span>
                          <span className="mt-0.5 block text-[11px] text-amber-200">{formatTC(box.price)} TC</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-[#0D0F12] p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-200">Открытий на игрока</div>
                        <div className="text-[11px] text-slate-500">От 1 до 25 кейсов</div>
                      </div>
                      <div className="inline-flex items-center rounded-lg border border-white/10 bg-[#14171D] focus-within:border-[#FACC15]/70 transition-colors">
                        <button type="button" onClick={() => updateCaseCount(caseCount - 1)} disabled={caseCount <= 1} aria-label="Уменьшить количество открытий" className="w-7 h-7 flex items-center justify-center text-sm font-bold text-slate-300 hover:text-[#FACC15] disabled:opacity-30 cursor-pointer transition-colors">
                          −
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label="Открытий на игрока"
                          value={caseCountDraft}
                          onChange={(event) => {
                            const digits = event.target.value.replace(/[^\d]/g, '').slice(0, 2);
                            setCaseCountDraft(digits);
                            const parsed = Number(digits);
                            if (digits && !Number.isNaN(parsed)) {
                              setCaseCount(Math.min(25, Math.max(1, parsed)));
                            }
                          }}
                          onBlur={() => updateCaseCount(Number(caseCountDraft) || 1)}
                          className="w-10 bg-transparent text-center font-mono-num text-sm font-bold text-white focus:outline-none"
                        />
                        <button type="button" onClick={() => updateCaseCount(caseCount + 1)} disabled={caseCount >= 25} aria-label="Увеличить количество открытий" className="w-7 h-7 flex items-center justify-center text-sm font-bold text-slate-300 hover:text-[#FACC15] disabled:opacity-30 cursor-pointer transition-colors">
                          +
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <input
                        type="range"
                        min={1}
                        max={25}
                        step={1}
                        aria-label="Ползунок количества открытий"
                        value={caseCount}
                        onChange={(event) => updateCaseCount(Number(event.target.value))}
                        className="farm-range w-full"
                        style={{
                          background: `linear-gradient(to right, #FACC15 0%, #F59E0B ${((caseCount - 1) / 24) * 100}%, #1F242D ${((caseCount - 1) / 24) * 100}%, #1F242D 100%)`,
                          borderRadius: '9999px',
                          height: '6px',
                        }}
                      />
                      <div className="flex items-center justify-between text-[10px] font-mono-num">
                        {[1, 5, 10, 15, 20, 25].map((mark) => (
                          <button key={mark} type="button" onClick={() => updateCaseCount(mark)} className={`px-1 py-0.5 rounded transition-colors cursor-pointer ${caseCount === mark ? 'text-[#FACC15] font-bold' : 'text-slate-500 hover:text-slate-300'}`}>
                            {mark}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-[#0D0F12] px-3 py-2.5 text-xs">
                    <span className="text-slate-400">Взнос каждого игрока</span>
                    <b className="font-mono-num text-amber-200">{formatTC((selectedCase?.price ?? 0) * caseCount)} TC</b>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-400">Выбери карточки для ставки. Соперник сделает свою ставку при входе в комнату.</p>
                  <div className="grid max-h-[360px] grid-cols-2 gap-x-1 gap-y-3 overflow-y-auto rounded-xl bg-[#0D0F12] p-2 sm:grid-cols-3">
                    {inventory.map(({ entry, item }) => (
                      <div key={entry.instanceId} className="flex justify-center">
                        <CardFrame
                          item={item}
                          size="xs"
                          selected={selectedIds.includes(entry.instanceId)}
                          onClick={() => setSelectedIds((ids) => (ids.includes(entry.instanceId) ? ids.filter((id) => id !== entry.instanceId) : [...ids, entry.instanceId]))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-[#0D0F12] p-2 text-xs">
                    <span className="text-slate-400">Выбрано: {selectedIds.length} карт.</span>
                    <b className="text-amber-200">Ставка {formatTC(selectedValue)} TC</b>
                  </div>
                </>
              )}
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <LockKeyhole className="h-4 w-4" />
                <input value={password} onChange={(event) => setPassword(event.target.value)} maxLength={32} placeholder="Пароль комнаты (необязательно)" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0D0F12] p-3 text-sm text-white" />
              </label>
              <button
                disabled={busyActionId === 'create' || (mode === 'cases' ? !selectedCase || selectedCase.price * caseCount > user.balance : selectedIds.length === 0)}
                onClick={() => void createRoom()}
                className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                Создать комнату
              </button>
            </section>

            <section className="space-y-3 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-bold text-white">
                  <Users className="h-4 w-4 text-amber-300" /> Открытые комнаты
                </h2>
                <button onClick={() => void refreshRooms()} aria-label="Обновить комнаты" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 cursor-pointer">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              {rooms.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Сейчас нет открытых комнат. Создай первую!</p>
              ) : (
                rooms.map((room) => {
                  const caseCost = (cases.find((box) => box.id === room.caseId)?.price ?? 0) * (room.caseCount ?? 1);
                  return (
                    <div key={room.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0D0F12] p-3">
                      <div className="flex-1 min-w-[180px]">
                        <div className="flex items-center gap-2 text-sm font-bold text-white">
                          {room.mode === 'cases' ? `Батл кейсов (${room.caseCount ?? 1})` : 'Батл апгрейдов'}
                          {room.hasPassword && <LockKeyhole className="h-3 w-3 text-slate-500" />}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {room.hostUsername} · {room.mode === 'cases' ? `${formatTC(caseCost)} TC` : `ставка ${formatTC(room.hostStakeValue)} TC`}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busyActionId === `join:${room.id}`}
                        onClick={() => promptAndJoin(room)}
                        className="rounded-lg bg-amber-400 hover:bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950 cursor-pointer disabled:opacity-40"
                      >
                        {busyActionId === `join:${room.id}` ? 'Вход...' : 'Принять'}
                      </button>
                    </div>
                  );
                })
              )}
            </section>
          </div>
        )}
      </div>

      {passwordPromptRoom && (
        <div role="dialog" aria-modal="true" aria-labelledby="room-password-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const target = passwordPromptRoom;
              const entered = passwordPromptInput;
              setPasswordPromptRoom(null);
              setPasswordPromptInput('');
              joinRoom(target, entered);
            }}
            className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-[#14161A] p-5 shadow-2xl"
          >
            <div>
              <h3 id="room-password-title" className="text-base font-bold text-white">Вход по паролю</h3>
              <p className="mt-1 text-xs text-slate-400">
                Комната игрока {passwordPromptRoom.hostUsername}
              </p>
            </div>
            <input
              type="password"
              autoFocus
              value={passwordPromptInput}
              onChange={(event) => setPasswordPromptInput(event.target.value)}
              placeholder="Введите пароль комнаты"
              aria-label="Пароль комнаты"
              maxLength={64}
              className="w-full rounded-xl border border-white/10 bg-[#0D0F12] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300/60"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPasswordPromptRoom(null);
                  setPasswordPromptInput('');
                }}
                className="rounded-lg border border-white/10 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!passwordPromptInput.trim()}
                className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-40 cursor-pointer"
              >
                Войти в батл
              </button>
            </div>
          </form>
        </div>
      )}

      {activeRoom?.status === 'completed' && progress >= 1 && !winnerDismissed && (
        <BattleWinnerOverlay
          winner={winner}
          host={{ username: activeRoom.hostUsername, avatarUrl: activeRoom.hostAvatarUrl, avatarColor: activeRoom.hostAvatarColor, netProfit: hostNetProfit }}
          guest={{ username: activeRoom.guestUsername ?? 'Соперник', avatarUrl: activeRoom.guestAvatarUrl, avatarColor: activeRoom.guestAvatarColor, netProfit: guestNetProfit }}
          isViewerWinner={activeRoom.winnerUserId === user.id}
          isDraw={!activeRoom.winnerUserId}
          caseBattle={activeRoom.mode === 'cases'}
          prizeValue={activeRoom.hostStakeValue + activeRoom.guestStakeValue}
          onClose={() => {
            markBattleWinnerSeen(user.id, activeRoom.id);
            setWinnerDismissed(true);
          }}
        />
      )}
    </>
  );
};

function ProfitSummary({ name, avatarUrl, avatarColor, isViewer, caseCount, dropsTotal, entryCost, netProfit }: { name: string; avatarUrl?: string; avatarColor?: string; isViewer: boolean; caseCount: number; dropsTotal: number; entryCost: number; netProfit: number }) {
  return (
    <section className={`rounded-xl border p-3 ${isViewer ? 'border-amber-300/25 bg-amber-300/[0.045]' : 'border-white/[0.07] bg-[#0D0F12]'}`}>
      <div className="flex items-center gap-2">
        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-700">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: avatarColor || '#475569' }}>
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-sm font-bold ${isViewer ? 'text-amber-200' : 'text-slate-300'}`}>
            {isViewer ? 'Твоя прибыль' : 'Соперник'} · {name}
          </div>
          <div className="text-[11px] text-slate-500">Итог за {caseCount} раундов</div>
        </div>
        <b className={`text-lg ${netProfit >= 0 ? (isViewer ? 'text-amber-200' : 'text-slate-200') : 'text-rose-300'}`}>
          {netProfit >= 0 ? '+' : ''}
          {formatTC(netProfit)} <small className="text-xs">TC</small>
        </b>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-2 text-[11px]">
        <span className="text-slate-500">
          Дропы <b className="text-slate-300">{formatTC(dropsTotal)} TC</b>
        </span>
        <span className="text-right text-slate-500">
          Взносы <b className="text-slate-300">−{formatTC(entryCost)} TC</b>
        </span>
      </div>
    </section>
  );
}

function StakePanel({ label, value, items, inventory }: { label: string; value: number; items: ItemCard[]; inventory: UserProfile['inventory'] }) {
  return (
    <div className="rounded-xl bg-[#0D0F12] p-4">
      <div className="flex justify-between text-sm font-bold text-white">
        <span>{label}</span>
        <span className="text-amber-200">{formatTC(value)} TC</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {inventory.map((entry) => {
          const card = items.find((item) => item.id === entry.itemId);
          return card ? (
            <div key={entry.instanceId} title={card.name} className="rounded-lg bg-white/[0.04] p-2">
              <img src={card.imageUrl} alt={card.name} className="h-12 w-16 object-contain" />
            </div>
          ) : null;
        })}
      </div>
      <Shield className="mt-3 h-4 w-4 text-slate-600" />
    </div>
  );
}
