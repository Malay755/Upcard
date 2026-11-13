import React, { useEffect, useMemo, useState } from 'react';
import { Swords, Shield, Users, Coins, LockKeyhole, Trophy, RefreshCw } from 'lucide-react';
import type { BattleInvitationSummary, BattleMode, BattleRoomSummary, BootstrapPayload, CaseBox, FriendSummary, ItemCard, UserProfile } from '../types';
import { formatTC } from '../utils/economics';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие.');
  return data as T;
}

interface Props {
  user: UserProfile;
  items: ItemCard[];
  cases: CaseBox[];
  friends: FriendSummary[];
  invitations: BattleInvitationSummary[];
  isAuthorized: boolean;
  onOpenTelegramLogin: () => void;
  onEnableNotifications: () => void;
  onSellItems: (ids: string[]) => Promise<void>;
  onPayload: (payload: BootstrapPayload) => void;
}

export const BattlesView: React.FC<Props> = ({ user, items, cases, friends, invitations, isAuthorized, onOpenTelegramLogin, onEnableNotifications, onSellItems, onPayload }) => {
  const [mode, setMode] = useState<BattleMode>('cases');
  const [caseId, setCaseId] = useState(cases[0]?.id ?? '');
  const [caseCount, setCaseCount] = useState(1);
  const [password, setPassword] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inviteFriendId, setInviteFriendId] = useState('');
  const [rooms, setRooms] = useState<BattleRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<BattleRoomSummary | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [, setTick] = useState(0);
  const selectedValue = useMemo(() => user.inventory.filter((entry) => selectedIds.includes(entry.instanceId)).reduce((sum, entry) => sum + (items.find((item) => item.id === entry.itemId)?.price ?? 0), 0), [user.inventory, items, selectedIds]);
  const selectedCase = cases.find((entry) => entry.id === caseId);
  const inventory = user.inventory.map((entry) => ({ entry, item: items.find((card) => card.id === entry.itemId) })).filter((row): row is { entry: UserProfile['inventory'][number]; item: ItemCard } => Boolean(row.item));

  const refreshRooms = async () => {
    try { setRooms((await request<{ battles: BattleRoomSummary[] }>('/api/battles')).battles); } catch { /* Keep the latest list on a network interruption. */ }
  };
  useEffect(() => {
    void refreshRooms();
    void request<{ battle: BattleRoomSummary | null }>('/api/battles/current').then((result) => { if (result.battle) setActiveRoom(result.battle); }).catch(() => undefined);
    const timer = window.setInterval(refreshRooms, 2500); return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!activeRoom) return;
    const update = async () => {
      try { const result = await request<{ battle: BattleRoomSummary }>(`/api/battles/${encodeURIComponent(activeRoom.id)}`); setActiveRoom(result.battle); } catch (e) { setError(e instanceof Error ? e.message : 'Комната недоступна.'); }
    };
    void update();
    const timer = window.setInterval(() => { void update(); setTick((value) => value + 1); }, 900);
    return () => window.clearInterval(timer);
  }, [activeRoom?.id]);

  const run = async (action: () => Promise<void>) => { setError(''); setNotice(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка.'); } };
  const createRoom = () => run(async () => {
    const result = await request<{ battle: BattleRoomSummary; payload?: BootstrapPayload }>('/api/battles', { method: 'POST', body: JSON.stringify({ mode, caseId, caseCount, password, stakeItemIds: selectedIds }) });
    setActiveRoom(result.battle); setPassword(''); if (result.payload) onPayload(result.payload); await refreshRooms();
  });
  const joinRoom = (room: BattleRoomSummary, roomPassword = '') => run(async () => {
    const result = await request<{ battle: BattleRoomSummary; payload: BootstrapPayload }>(`/api/battles/${encodeURIComponent(room.id)}/join`, { method: 'POST', body: JSON.stringify({ password: roomPassword, stakeItemIds: selectedIds }) });
    onPayload(result.payload); setActiveRoom(result.battle); await refreshRooms();
  });
  const acceptInvite = (invite: BattleInvitationSummary) => run(async () => {
    const result = await request<{ battle: BattleRoomSummary; payload: BootstrapPayload }>(`/api/battle-invitations/${encodeURIComponent(invite.id)}/accept`, { method: 'POST', body: JSON.stringify({ stakeItemIds: selectedIds }) });
    onPayload(result.payload); setActiveRoom(result.battle); await refreshRooms();
  });
  const declineInvite = (id: string) => run(async () => { const result = await request<{ payload: BootstrapPayload }>(`/api/battle-invitations/${encodeURIComponent(id)}`, { method: 'DELETE' }); onPayload(result.payload); });
  const cancelRoom = () => activeRoom && run(async () => {
    const result = await request<{ payload: BootstrapPayload }>(`/api/battles/${encodeURIComponent(activeRoom.id)}`, { method: 'DELETE' }); onPayload(result.payload); setActiveRoom(null); await refreshRooms();
  });
  const inviteFriend = () => activeRoom && run(async () => {
    await request('/api/battles/' + encodeURIComponent(activeRoom.id) + '/invite', { method: 'POST', body: JSON.stringify({ friendId: inviteFriendId }) }); setNotice('Приглашение отправлено.');
  });

  const progress = activeRoom?.status === 'completed' && activeRoom.startedAt && activeRoom.durationMs
    ? Math.min(1, Math.max(0, (Date.now() - activeRoom.startedAt) / activeRoom.durationMs)) : 0;
  const visibleRounds = activeRoom?.roundResults?.slice(0, Math.ceil(progress * (activeRoom.caseCount ?? activeRoom.roundResults.length))) ?? [];
  const battleCaseCards = activeRoom?.roundResults?.flatMap((row) => [row.hostDrop, row.guestDrop]) ?? [];
  const totalCards = activeRoom?.mode === 'cases' ? battleCaseCards.length : 0;

  if (!isAuthorized) return <section className="rounded-2xl border border-white/10 bg-[#14161A] p-10 text-center"><Swords className="mx-auto mb-3 h-10 w-10 text-amber-300"/><h1 className="text-xl font-bold text-white">Батлы игроков</h1><p className="my-3 text-sm text-slate-400">Войди через Telegram, чтобы создавать комнаты и играть с друзьями.</p><button onClick={onOpenTelegramLogin} className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-slate-950">Войти через Telegram</button></section>;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-white/[0.07] bg-gradient-to-r from-[#171a20] to-[#111318] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-amber-300/10 p-3 text-amber-300"><Swords className="h-6 w-6"/></span><div><h1 className="text-2xl font-black text-white">Батлы</h1><p className="text-sm text-slate-400">Соревнуйся с другим игроком в кейсах или апгрейдах.</p></div></div>{'Notification' in window && Notification.permission === 'default' && <button onClick={onEnableNotifications} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]">Включить уведомления</button>}</div>
    </section>

    {invitations.length > 0 && <section className="space-y-2 rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-4"><h2 className="font-bold text-amber-100">Приглашения в батл</h2>{invitations.map((invite) => <div key={invite.id} className="flex flex-wrap items-center gap-2 text-sm"><span className="flex-1 text-white">{invite.fromUsername} зовёт в {invite.mode === 'cases' ? `батл кейсов (${invite.caseCount})` : 'батл апгрейдов'}</span><button onClick={() => void acceptInvite(invite)} className="rounded-lg bg-emerald-500/15 px-3 py-2 font-bold text-emerald-300">Принять</button><button onClick={() => void declineInvite(invite.id)} className="rounded-lg bg-rose-500/10 px-3 py-2 font-bold text-rose-300">Отклонить</button></div>)}</section>}

    {error && <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}{notice && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}

    {activeRoom ? <section className="space-y-4 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs uppercase tracking-wider text-amber-300">{activeRoom.mode === 'cases' ? `Батл кейсов · ${activeRoom.caseCount} открытий` : 'Батл апгрейдов'}</div><h2 className="mt-1 text-xl font-bold text-white">{activeRoom.hostUsername} <span className="text-amber-300">VS</span> {activeRoom.guestUsername ?? 'Ожидаем игрока'}</h2></div>{activeRoom.status === 'waiting' && activeRoom.hostUserId === user.id && <button onClick={() => void cancelRoom()} className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">Отменить и вернуть ставку</button>}</div>
      {activeRoom.status === 'waiting' ? <div className="space-y-4 rounded-xl bg-[#0D0F12] p-4"><p className="text-sm text-slate-300">Комната открыта. Когда второй игрок примет участие, батл начнётся автоматически.</p>{activeRoom.hostUserId === user.id && friends.length > 0 && <div className="flex flex-wrap gap-2"><select value={inviteFriendId} onChange={(event) => setInviteFriendId(event.target.value)} className="min-w-[180px] rounded-lg border border-white/10 bg-[#171a20] px-3 py-2 text-sm text-white"><option value="">Выбери друга</option>{friends.map((friend) => <option key={friend.id} value={friend.id}>{friend.telegramUsername ? `@${friend.telegramUsername}` : friend.username}</option>)}</select><button disabled={!inviteFriendId} onClick={() => void inviteFriend()} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">Пригласить друга</button></div>}</div> : <>
        {activeRoom.status === 'completed' && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#0D0F12] p-4"><Trophy className="h-5 w-5 text-amber-300"/><span className="font-bold text-white">{activeRoom.winnerUserId ? `Победитель: ${activeRoom.winnerUserId === user.id ? 'Вы' : activeRoom.winnerUserId === activeRoom.hostUserId ? activeRoom.hostUsername : activeRoom.guestUsername}` : 'Ничья — каждый получил свои дропы'}</span>{activeRoom.mode === 'upgrade' && <span className="text-xs text-slate-400">Шанс {activeRoom.hostUsername}: {activeRoom.hostWinChance?.toFixed(2)}%</span>}{activeRoom.rewardInventoryIds?.length ? <button onClick={() => void onSellItems(activeRoom.rewardInventoryIds!)} className="ml-auto rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300">Продать выигрыш</button> : null}</div>}
        {activeRoom.mode === 'cases' ? <div className="grid gap-4 md:grid-cols-2"><BattleColumn title={activeRoom.hostUsername} rows={visibleRounds.map((row) => row.hostDrop)} items={items}/><BattleColumn title={activeRoom.guestUsername ?? 'Соперник'} rows={visibleRounds.map((row) => row.guestDrop)} items={items}/></div> : <div className="space-y-4"><UpgradeWheel hostName={activeRoom.hostUsername} guestName={activeRoom.guestUsername ?? 'Соперник'} hostChance={activeRoom.hostWinChance ?? 50} rollValue={activeRoom.rollValue ?? 0} progress={progress} winnerName={activeRoom.winnerUserId === activeRoom.hostUserId ? activeRoom.hostUsername : activeRoom.guestUsername ?? '—'} won={activeRoom.winnerUserId === user.id}/><div className="grid gap-3 sm:grid-cols-2"><StakePanel label={activeRoom.hostUsername} value={activeRoom.hostStakeValue} items={items} inventory={activeRoom.hostItems ?? []}/><StakePanel label={activeRoom.guestUsername ?? 'Соперник'} value={activeRoom.guestStakeValue} items={items} inventory={activeRoom.guestItems ?? []}/></div></div>}
        <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-amber-300 to-orange-500 transition-[width] duration-500" style={{ width: `${activeRoom.status === 'completed' ? progress * 100 : 0}%` }}/></div>
        {activeRoom.mode === 'cases' && activeRoom.status === 'completed' && <div className="text-right text-xs text-slate-500">{visibleRounds.length} / {activeRoom.caseCount} синхронных открытий · дропов в батле: {totalCards}</div>}
      </>}</section> : <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.8fr)_1.2fr]">
      <section className="space-y-4 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5"><h2 className="flex items-center gap-2 font-bold text-white"><Swords className="h-4 w-4 text-amber-300"/> Создать комнату</h2>
        <div className="grid grid-cols-2 gap-2">{(['cases','upgrade'] as BattleMode[]).map((entry) => <button key={entry} onClick={() => setMode(entry)} className={`rounded-xl border p-3 text-sm font-bold ${mode === entry ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-white/10 text-slate-400'}`}>{entry === 'cases' ? 'Батл кейсов' : 'Батл апгрейдов'}</button>)}</div>
        {mode === 'cases' ? <><label className="block space-y-1 text-xs text-slate-400">Кейс<select value={caseId} onChange={(event) => setCaseId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0D0F12] p-3 text-sm text-white">{cases.map((box) => <option value={box.id} key={box.id}>{box.name} · {formatTC(box.price)} TC</option>)}</select></label><label className="block space-y-1 text-xs text-slate-400">Количество открытий (максимум 25)<input type="number" min={1} max={25} value={caseCount} onChange={(event) => setCaseCount(Math.min(25, Math.max(1, Number(event.target.value))))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0D0F12] p-3 text-sm text-white"/></label><p className="text-xs text-slate-500">Взнос: {formatTC((selectedCase?.price ?? 0) * caseCount)} TC с каждого игрока.</p></> : <><p className="text-xs text-slate-400">Выбери карточки в ставку. Сопернику нужно поставить карточки аналогичным способом.</p><div className="max-h-52 space-y-1 overflow-y-auto">{inventory.map(({ entry, item }) => <label key={entry.instanceId} className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#0D0F12] p-2 text-xs"><input type="checkbox" checked={selectedIds.includes(entry.instanceId)} onChange={() => setSelectedIds((ids) => ids.includes(entry.instanceId) ? ids.filter((id) => id !== entry.instanceId) : [...ids, entry.instanceId])}/><span className="flex-1 truncate text-white">{item.name}</span><span className="text-amber-200">{formatTC(item.price)} TC</span></label>)}</div><div className="text-xs text-slate-400">Твоя ставка: <b className="text-white">{formatTC(selectedValue)} TC</b></div></>}
        <label className="flex items-center gap-2 text-xs text-slate-400"><LockKeyhole className="h-4 w-4"/><input value={password} onChange={(event) => setPassword(event.target.value)} maxLength={32} placeholder="Пароль комнаты (необязательно)" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0D0F12] p-3 text-sm text-white"/></label>
        <button onClick={() => void createRoom()} className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-300">Создать комнату</button>
      </section>
      <section className="space-y-3 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold text-white"><Users className="h-4 w-4 text-amber-300"/> Открытые комнаты</h2><button onClick={() => void refreshRooms()} aria-label="Обновить комнаты" className="rounded-lg p-2 text-slate-400 hover:bg-white/5"><RefreshCw className="h-4 w-4"/></button></div>
        {rooms.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Сейчас нет открытых комнат. Создай первую!</p> : rooms.map((room) => <div key={room.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0D0F12] p-3"><div className="flex-1"><div className="flex items-center gap-2 text-sm font-bold text-white">{room.mode === 'cases' ? 'Батл кейсов' : 'Батл апгрейдов'}{room.hasPassword && <LockKeyhole className="h-3 w-3 text-slate-500"/>}</div><div className="mt-1 text-xs text-slate-400">{room.hostUsername}</div></div><button onClick={() => void joinRoom(room, room.hasPassword ? window.prompt('Пароль комнаты') ?? '' : '')} className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950">Принять</button></div>)}
      </section></div>}
  </div>;
};

function BattleColumn({ title, rows, items }: { title: string; rows: ItemCard[]; items: ItemCard[] }) {
  return <div className="min-h-40 rounded-xl bg-[#0D0F12] p-4"><h3 className="mb-3 text-sm font-bold text-amber-200">{title}</h3><div className="space-y-2">{rows.map((card, index) => <div key={`${card.id}-${index}`} className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2"><span className="w-6 text-xs text-slate-500">{index + 1}</span><img src={card.imageUrl} alt="" className="h-9 w-12 object-contain"/><span className="flex-1 text-xs text-white">{items.find((entry) => entry.id === card.id)?.name ?? card.name}</span><span className="text-xs font-bold text-amber-200">{formatTC(card.price)} TC</span></div>)}</div></div>;
}

function StakePanel({ label, value, items, inventory }: { label: string; value: number; items: ItemCard[]; inventory: UserProfile['inventory'] }) {
  return <div className="rounded-xl bg-[#0D0F12] p-4"><div className="flex justify-between text-sm font-bold text-white"><span>{label}</span><span className="text-amber-200">{formatTC(value)} TC</span></div><div className="mt-3 flex flex-wrap gap-2">{inventory.map((entry) => { const card = items.find((item) => item.id === entry.itemId); return card ? <div key={entry.instanceId} title={card.name} className="rounded-lg bg-white/[0.04] p-2"><img src={card.imageUrl} alt={card.name} className="h-12 w-16 object-contain"/></div> : null; })}</div><Shield className="mt-3 h-4 w-4 text-slate-600"/></div>;
}

function UpgradeWheel({ hostName, guestName, hostChance, rollValue, progress, winnerName, won }: { hostName: string; guestName: string; hostChance: number; rollValue: number; progress: number; winnerName: string; won: boolean }) {
  const rotation = 1800 * (1 - progress) - rollValue * 3.6;
  return <div className="flex flex-col items-center gap-3 rounded-xl bg-[#0D0F12] p-5">
    <div className="text-xs text-slate-400">Вероятность выигрыша рассчитана по стоимости ставок</div>
    <div className="relative h-48 w-48 sm:h-56 sm:w-56">
      <div className="absolute -top-1 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-white drop-shadow" />
      <div className="absolute inset-2 rounded-full border-[10px] border-[#242833] shadow-[0_0_35px_rgba(250,204,21,0.15)]" style={{ background: `conic-gradient(#FACC15 0 ${hostChance}%, #8B5CF6 ${hostChance}% 100%)`, transform: `rotate(${rotation}deg)`, transition: 'transform 120ms linear' }} />
      <div className="absolute inset-[36%] flex flex-col items-center justify-center rounded-full border border-white/10 bg-[#14161A] text-center shadow-inner"><span className="text-[9px] text-amber-200">{hostChance.toFixed(1)}%</span><span className="text-[9px] text-violet-300">{(100-hostChance).toFixed(1)}%</span></div>
    </div>
    <div className="flex w-full max-w-md justify-between gap-3 text-xs"><span className="text-amber-200">{hostName} · {hostChance.toFixed(2)}%</span><span className="text-right text-violet-300">{guestName} · {(100-hostChance).toFixed(2)}%</span></div>
    {progress >= 1 && <div className="text-sm font-bold text-white">{won ? 'Ты выиграл!' : `Победитель: ${winnerName}`}</div>}
  </div>;
}
