import React, { useCallback, useEffect, useState } from 'react';
import {
  Coins,
  Gamepad2,
  Layers,
  LockKeyhole,
  RefreshCw,
  Users,
} from 'lucide-react';
import type {
  BootstrapPayload,
  DurakInvitationSummary,
  DurakMode,
  DurakRoomProjection,
  FriendSummary,
  ItemCard,
  UserProfile,
} from '../types';
import { formatTC } from '../utils/economics';
import { DurakAnimatedDeckPreview, DurakDeckModal } from './DurakCard';
import { DurakTable } from './DurakTable';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Не удалось выполнить действие.');
  }
  return data as T;
}

const STAKE_OPTIONS = [0, 100, 250, 500, 1000] as const;

interface GamesViewProps {
  user: UserProfile;
  items: ItemCard[];
  friends: FriendSummary[];
  invitations: DurakInvitationSummary[];
  isAuthorized: boolean;
  durakSyncKey?: number;
  liveDurakRoom?: DurakRoomProjection | null;
  onOpenTelegramLogin: () => void;
  onPayload: (payload: BootstrapPayload) => void;
  onRefreshPayload?: () => Promise<void>;
}

export const GamesView: React.FC<GamesViewProps> = ({
  user,
  items,
  friends,
  invitations,
  isAuthorized,
  durakSyncKey = 0,
  liveDurakRoom = null,
  onOpenTelegramLogin,
  onPayload,
  onRefreshPayload,
}) => {
  const [mode, setMode] = useState<DurakMode>('podkidnoy');
  const [maxPlayers, setMaxPlayers] = useState<number>(2);
  const [stake, setStake] = useState<number>(0);
  const [password, setPassword] = useState('');
  const [rooms, setRooms] = useState<DurakRoomProjection[]>([]);
  const [activeRoom, setActiveRoom] = useState<DurakRoomProjection | null>(null);
  const [deckOpen, setDeckOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordPromptRoom, setPasswordPromptRoom] = useState<DurakRoomProjection | null>(null);
  const [passwordPromptInput, setPasswordPromptInput] = useState('');
  const [dismissedCompletedIds, setDismissedCompletedIds] = useState<Set<string>>(() => new Set());

  const refreshLobby = useCallback(async () => {
    try {
      const data = await requestJson<{ rooms: DurakRoomProjection[] }>('/api/durak');
      setRooms(data.rooms);
    } catch {
      /* Preserve current list during temporary network glitches */
    }
  }, []);

  const syncCurrentRoom = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      const data = await requestJson<{ room: DurakRoomProjection | null }>('/api/durak/current');
      if (!data.room) {
        setActiveRoom((prev) => (prev && prev.status === 'completed' ? prev : null));
        return;
      }
      if (data.room.status === 'completed' && dismissedCompletedIds.has(data.room.id)) {
        return;
      }
      setActiveRoom(data.room);
    } catch {
      /* Keep current active view */
    }
  }, [isAuthorized, dismissedCompletedIds]);

  useEffect(() => {
    void refreshLobby();
    if (isAuthorized) {
      void syncCurrentRoom();
      void onRefreshPayload?.();
    }
    const timer = window.setInterval(() => {
      void refreshLobby();
      if (isAuthorized) void syncCurrentRoom();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isAuthorized, refreshLobby, syncCurrentRoom, onRefreshPayload]);

  useEffect(() => {
    if (!liveDurakRoom) return;
    if (liveDurakRoom.status === 'completed' && dismissedCompletedIds.has(liveDurakRoom.id)) return;
    setActiveRoom(liveDurakRoom);
  }, [liveDurakRoom, dismissedCompletedIds]);

  useEffect(() => {
    if (durakSyncKey <= 0) return;
    void refreshLobby();
    void syncCurrentRoom();
  }, [durakSyncKey, refreshLobby, syncCurrentRoom]);

  const runAction = async (fn: () => Promise<void>) => {
    if (busy) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Произошла ошибка.');
    } finally {
      setBusy(false);
    }
  };

  const createTable = () =>
    runAction(async () => {
      const res = await requestJson<{ room: DurakRoomProjection; payload: BootstrapPayload }>('/api/durak', {
        method: 'POST',
        body: JSON.stringify({ mode, maxPlayers, stake, password }),
      });
      setActiveRoom(res.room);
      setPassword('');
      onPayload(res.payload);
      await refreshLobby();
    });

  const joinTable = (room: DurakRoomProjection, roomPassword = '') =>
    runAction(async () => {
      const res = await requestJson<{ room: DurakRoomProjection; payload: BootstrapPayload }>(
        `/api/durak/${encodeURIComponent(room.id)}/join`,
        { method: 'POST', body: JSON.stringify({ password: roomPassword }) }
      );
      setActiveRoom(res.room);
      onPayload(res.payload);
      await refreshLobby();
    });

  const promptAndJoin = (room: DurakRoomProjection) => {
    if (room.hasPassword) {
      setPasswordPromptInput('');
      setPasswordPromptRoom(room);
      return;
    }
    void joinTable(room, '');
  };

  const acceptInvite = (invite: DurakInvitationSummary) =>
    runAction(async () => {
      const res = await requestJson<{ room: DurakRoomProjection; payload: BootstrapPayload }>(
        `/api/durak-invitations/${encodeURIComponent(invite.id)}/accept`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setActiveRoom(res.room);
      onPayload(res.payload);
      await refreshLobby();
    });

  const declineInvite = (inviteId: string) =>
    runAction(async () => {
      const res = await requestJson<{ payload: BootstrapPayload }>(
        `/api/durak-invitations/${encodeURIComponent(inviteId)}`,
        { method: 'DELETE' }
      );
      onPayload(res.payload);
    });

  const handleDurakMove = (action: {
    type: 'attack' | 'defend' | 'transfer' | 'pass' | 'take';
    cardId?: string;
    pairIndex?: number;
  }) =>
    runAction(async () => {
      if (!activeRoom) return;
      const res = await requestJson<{ room: DurakRoomProjection; payload: BootstrapPayload }>(
        `/api/durak/${encodeURIComponent(activeRoom.id)}/action`,
        { method: 'POST', body: JSON.stringify(action) }
      );
      setActiveRoom(res.room);
      onPayload(res.payload);
    });

  const handleInviteFriend = (friendId: string) =>
    runAction(async () => {
      if (!activeRoom || !friendId) return;
      await requestJson(`/api/durak/${encodeURIComponent(activeRoom.id)}/invite`, {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      });
      setNotice('Приглашение за стол отправлено другу.');
    });

  const handleStartEarly = () =>
    runAction(async () => {
      if (!activeRoom) return;
      const res = await requestJson<{ room: DurakRoomProjection; payload: BootstrapPayload }>(
        `/api/durak/${encodeURIComponent(activeRoom.id)}/start`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setActiveRoom(res.room);
      onPayload(res.payload);
    });

  const handleCancelRoom = () =>
    runAction(async () => {
      if (!activeRoom) return;
      const res = await requestJson<{ payload: BootstrapPayload }>(
        `/api/durak/${encodeURIComponent(activeRoom.id)}`,
        { method: 'DELETE' }
      );
      setActiveRoom(null);
      onPayload(res.payload);
      await refreshLobby();
    });

  const handleLeaveWaiting = () =>
    runAction(async () => {
      if (!activeRoom) return;
      const res = await requestJson<{ payload: BootstrapPayload }>(
        `/api/durak/${encodeURIComponent(activeRoom.id)}/leave`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setActiveRoom(null);
      onPayload(res.payload);
      await refreshLobby();
    });

  const handleForfeit = () =>
    runAction(async () => {
      if (!activeRoom) return;
      const res = await requestJson<{ room: DurakRoomProjection; payload: BootstrapPayload }>(
        `/api/durak/${encodeURIComponent(activeRoom.id)}/forfeit`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setActiveRoom(res.room);
      onPayload(res.payload);
    });

  return (
    <>
      <div className="space-y-5">
        {/* Hero Header (hidden while inside an active table so cards & felt fit cleanly in viewport) */}
        {!activeRoom && (
          <section className="rounded-2xl border border-white/[0.07] bg-gradient-to-r from-[#171a20] to-[#111318] p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <DurakAnimatedDeckPreview onClick={() => setDeckOpen(true)} />
                <div>
                  <h1 className="font-display text-2xl font-black text-white">Игры · Дурак на 32 карты</h1>
                  <p className="text-sm text-slate-400">
                    Подкидной и Переводной онлайн против реальных игроков на белых фотокартах сквада.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeckOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-xs font-bold text-white hover:bg-white/[0.1] cursor-pointer"
              >
                <Layers className="h-4 w-4 text-[#FACC15]" />
                Колода 32 карт
              </button>
            </div>
          </section>
        )}

        {!isAuthorized ? (
          <section className="rounded-2xl border border-white/10 bg-[#14161A] p-10 text-center">
            <Gamepad2 className="mx-auto mb-3 h-10 w-10 text-[#FACC15]" />
            <h2 className="font-display text-xl font-bold text-white">Онлайн-столы Дурака</h2>
            <p className="my-3 text-sm text-slate-400">
              Войдите через Telegram, чтобы открывать столы, звать друзей и играть на 32-карточной колоде.
            </p>
            <button
              type="button"
              onClick={onOpenTelegramLogin}
              className="rounded-xl bg-[#FACC15] px-5 py-3 font-bold text-[#0B0D10] hover:bg-[#FDE047] cursor-pointer"
            >
              Войти через Telegram
            </button>
          </section>
        ) : (
          <>
            {/* Pending Durak Invitations */}
            {invitations.length > 0 && (
              <section className="space-y-2 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4">
                <h2 className="font-bold text-emerald-200">Приглашения в Дурака ({invitations.length})</h2>
                {invitations.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0D0F12]/80 px-3 py-2.5 text-sm"
                  >
                    <div className="flex-1 min-w-[200px]">
                      <span className="font-semibold text-white">{invite.fromUsername}</span>{' '}
                      <span className="text-slate-300">
                        зовёт в {invite.mode === 'perevodnoy' ? 'Переводного' : 'Подкидного'} ({invite.maxPlayers} чел. ·{' '}
                        {invite.stake > 0 ? `${formatTC(invite.stake)} TC` : 'без ставки'})
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void acceptInvite(invite)}
                      className="min-h-[38px] rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 px-3.5 py-1.5 font-bold text-emerald-300 cursor-pointer disabled:opacity-50"
                    >
                      Сесть за стол
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void declineInvite(invite.id)}
                      className="min-h-[38px] rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-400/20 px-3.5 py-1.5 font-bold text-rose-300 cursor-pointer disabled:opacity-50"
                    >
                      Отклонить
                    </button>
                  </div>
                ))}
              </section>
            )}

            {error && (
              <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-300">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                {notice}
              </p>
            )}

            {activeRoom ? (
              <DurakTable
                room={activeRoom}
                user={user}
                friends={friends}
                busyAction={busy}
                onAction={handleDurakMove}
                onInviteFriend={handleInviteFriend}
                onStartEarly={handleStartEarly}
                onCancelRoom={handleCancelRoom}
                onLeaveWaitingRoom={handleLeaveWaiting}
                onForfeit={handleForfeit}
                onOpenDeck={() => setDeckOpen(true)}
                onDismissCompleted={() => {
                  setDismissedCompletedIds((prev) => new Set(prev).add(activeRoom.id));
                  setActiveRoom(null);
                  void refreshLobby();
                }}
              />
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(300px,0.85fr)_1.15fr]">
                {/* Create Online Table */}
                <section className="space-y-4 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5">
                  <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
                    <Gamepad2 className="h-4 w-4 text-[#FACC15]" /> Создать онлайн-стол
                  </h2>

                  <div>
                    <div className="mb-2 text-xs font-semibold text-slate-400">Правила Дурака</div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: 'podkidnoy', label: 'Подкидной', sub: 'Классика' },
                        { id: 'perevodnoy', label: 'Переводной', sub: 'С переводом' },
                      ] as const).map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setMode(entry.id)}
                          aria-pressed={mode === entry.id}
                          className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                            mode === entry.id
                              ? 'border-[#FACC15]/50 bg-[#FACC15]/10 text-amber-200'
                              : 'border-white/10 bg-[#0D0F12] text-slate-400 hover:border-white/20'
                          }`}
                        >
                          <div className="text-sm font-bold text-white">{entry.label}</div>
                          <div className="text-[11px] text-slate-400">{entry.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold text-slate-400">Игроков за столом</div>
                    <div className="grid grid-cols-3 gap-2">
                      {[2, 3, 4].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setMaxPlayers(count)}
                          aria-pressed={maxPlayers === count}
                          className={`rounded-xl border py-2.5 text-sm font-bold font-mono-num transition-colors cursor-pointer ${
                            maxPlayers === count
                              ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                              : 'border-white/10 bg-[#0D0F12] text-slate-400 hover:border-white/20'
                          }`}
                        >
                          {count} игр.
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-400">Ставка на вход</span>
                      <span className="font-mono-num text-slate-400">Баланс: {formatTC(user.balance)} TC</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                      {STAKE_OPTIONS.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setStake(amount)}
                          aria-pressed={stake === amount}
                          className={`rounded-lg border py-2 text-xs font-bold font-mono-num transition-colors cursor-pointer ${
                            stake === amount
                              ? 'border-[#FACC15]/60 bg-[#FACC15]/15 text-[#FACC15]'
                              : 'border-white/10 bg-[#0D0F12] text-slate-400 hover:border-white/20'
                          }`}
                        >
                          {amount === 0 ? 'Без ставки' : `${amount}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <LockKeyhole className="h-4 w-4 shrink-0" />
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={32}
                      placeholder="Пароль стола (необязательно)"
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0D0F12] px-3 py-2.5 text-sm text-white"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={busy || (stake > 0 && user.balance < stake)}
                    onClick={() => void createTable()}
                    className="w-full rounded-xl bg-[#FACC15] px-4 py-3 text-sm font-black text-[#0B0D10] hover:bg-[#FDE047] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                  >
                    Открыть стол · {mode === 'perevodnoy' ? 'Переводной' : 'Подкидной'}
                  </button>
                </section>

                {/* Open Online Tables */}
                <section className="space-y-3 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
                      <Users className="h-4 w-4 text-emerald-300" /> Открытые онлайн-столы
                    </h2>
                    <button
                      type="button"
                      onClick={() => void refreshLobby()}
                      aria-label="Обновить список столов"
                      className="rounded-lg p-2 text-slate-400 hover:bg-white/5 cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>

                  {rooms.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">
                      Открытых столов пока нет. Создайте первый стол или пригласите друга!
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {rooms.map((room) => (
                        <div
                          key={room.id}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0D0F12] p-3.5"
                        >
                          <div className="min-w-[180px] flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                                {room.mode === 'perevodnoy' ? 'Переводной' : 'Подкидной'}
                              </span>
                              <span className="text-sm font-bold text-white">{room.hostUsername}</span>
                              {room.hasPassword && <LockKeyhole className="h-3.5 w-3.5 text-slate-500" />}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                              <span className="font-mono-num">
                                Места: {room.players.length}/{room.maxPlayers}
                              </span>
                              <span className="inline-flex items-center gap-1 font-mono-num text-amber-200">
                                <Coins className="h-3 w-3" />
                                {room.stake > 0 ? `${formatTC(room.stake)} TC` : 'Без ставки'}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={busy || (room.stake > 0 && user.balance < room.stake)}
                            onClick={() => promptAndJoin(room)}
                            className="rounded-lg bg-[#FACC15] px-4 py-2 text-xs font-black text-[#0B0D10] hover:bg-[#FDE047] disabled:opacity-45 cursor-pointer"
                          >
                            Сесть за стол
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </div>

      {/* Password Modal */}
      {passwordPromptRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ввод пароля стола"
        >
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-[#14161A] p-5 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-white">Стол под паролем</h3>
            <p className="text-xs text-slate-400">
              Введите пароль, чтобы присоединиться к столу {passwordPromptRoom.hostUsername}.
            </p>
            <input
              type="password"
              value={passwordPromptInput}
              onChange={(e) => setPasswordPromptInput(e.target.value)}
              placeholder="Пароль стола"
              autoFocus
              className="w-full rounded-lg border border-white/10 bg-[#0D0F12] px-3 py-2.5 text-sm text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasswordPromptRoom(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = passwordPromptRoom;
                  const pass = passwordPromptInput;
                  setPasswordPromptRoom(null);
                  void joinTable(target, pass);
                }}
                className="rounded-lg bg-[#FACC15] px-4 py-2 text-xs font-black text-[#0B0D10] cursor-pointer"
              >
                Войти
              </button>
            </div>
          </div>
        </div>
      )}

      <DurakDeckModal isOpen={deckOpen} onClose={() => setDeckOpen(false)} items={items} />
    </>
  );
};
