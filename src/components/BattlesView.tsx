import React, { useEffect, useMemo, useState } from 'react';
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
  const [selling, setSelling] = useState(false);
  const [winnerDismissed, setWinnerDismissed] = useState(false);
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
  useEffect(() => { setWinnerDismissed(false); }, [activeRoom?.id]);

  const run = async (action: () => Promise<void>) => { setError(''); setNotice(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка.'); } };
  const createRoom = () => run(async () => {
    const result = await request<{ battle: BattleRoomSummary; payload: BootstrapPayload }>('/api/battles', { method: 'POST', body: JSON.stringify({ mode, caseId, caseCount, password, stakeItemIds: selectedIds }) });
    setActiveRoom(result.battle); setPassword(''); setSelectedIds([]); onPayload(result.payload); await refreshRooms();
  });
  const joinRoom = (room: BattleRoomSummary, roomPassword = '') => run(async () => {
    const result = await request<{ battle: BattleRoomSummary; payload: BootstrapPayload }>(`/api/battles/${encodeURIComponent(room.id)}/join`, { method: 'POST', body: JSON.stringify({ password: roomPassword, stakeItemIds: selectedIds }) });
    onPayload(result.payload); setActiveRoom(result.battle); setSelectedIds([]); await refreshRooms();
  });
  const acceptInvite = (invite: BattleInvitationSummary) => run(async () => {
    const result = await request<{ battle: BattleRoomSummary; payload: BootstrapPayload }>(`/api/battle-invitations/${encodeURIComponent(invite.id)}/accept`, { method: 'POST', body: JSON.stringify({ stakeItemIds: selectedIds }) });
    onPayload(result.payload); setActiveRoom(result.battle); setSelectedIds([]); await refreshRooms();
  });
  const declineInvite = (id: string) => run(async () => { const result = await request<{ payload: BootstrapPayload }>(`/api/battle-invitations/${encodeURIComponent(id)}`, { method: 'DELETE' }); onPayload(result.payload); });
  const cancelRoom = () => activeRoom && run(async () => {
    const result = await request<{ payload: BootstrapPayload }>(`/api/battles/${encodeURIComponent(activeRoom.id)}`, { method: 'DELETE' }); onPayload(result.payload); setActiveRoom(null); await refreshRooms();
  });
  const inviteFriend = () => activeRoom && run(async () => {
    await request('/api/battles/' + encodeURIComponent(activeRoom.id) + '/invite', { method: 'POST', body: JSON.stringify({ friendId: inviteFriendId }) }); setNotice('Приглашение отправлено.');
  });

  const sellBattleReward = async () => {
    if (!activeRoom || selling) return;
    const ids = (activeRoom.rewardInventoryIds ?? []).filter((id) => user.inventory.some((entry) => entry.instanceId === id));
    if (!ids.length) { setError('Выигранные карточки уже отсутствуют в инвентаре. Обновите страницу.'); return; }
    setSelling(true); setError(''); setNotice('');
    try { await onSellItems(ids); setNotice(`Продано карточек: ${ids.length}. TC начислены на баланс.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось продать выигрыш.'); }
    finally { setSelling(false); }
  };
  const canJoin = (room: BattleRoomSummary) => room.mode === 'upgrade'
    ? selectedIds.length > 0
    : user.balance >= (cases.find((box) => box.id === room.caseId)?.price ?? Number.POSITIVE_INFINITY) * (room.caseCount ?? 1);
  const canAcceptInvite = (invite: BattleInvitationSummary) => invite.mode === 'upgrade'
    ? selectedIds.length > 0
    : user.balance >= (cases.find((box) => box.id === invite.caseId)?.price ?? Number.POSITIVE_INFINITY) * (invite.caseCount ?? 1);
  const promptAndJoin = (room: BattleRoomSummary) => {
    const secret = room.hasPassword ? window.prompt('Пароль комнаты') : '';
    if (secret === null) return;
    void joinRoom(room, secret ?? '');
  };

  const elapsed = activeRoom?.status === 'completed' && activeRoom.startedAt ? Math.max(0, Date.now() - activeRoom.startedAt) : 0;
  const progress = activeRoom?.durationMs ? Math.min(1, elapsed / activeRoom.durationMs) : 0;
  const caseCountForRoom = activeRoom?.caseCount ?? activeRoom?.roundResults?.length ?? 1;
  const currentRoundIndex = Math.min(caseCountForRoom - 1, Math.floor(elapsed / BATTLE_CASE_ROUND_MS));
  const visibleRounds = activeRoom?.roundResults?.filter((_, index) => elapsed >= (index + 1) * BATTLE_CASE_ROUND_MS) ?? [];
  const activeCase = cases.find((box) => box.id === activeRoom?.caseId);
  const caseDropPool = useMemo(() => activeCase?.itemIds.map((id) => items.find((item) => item.id === id)).filter((item): item is ItemCard => Boolean(item)) ?? [], [activeCase, items]);
  const hostDropTotal = visibleRounds.reduce((sum, row) => sum + row.hostDrop.price, 0);
  const guestDropTotal = visibleRounds.reduce((sum, row) => sum + row.guestDrop.price, 0);
  const caseEntryCost = (activeCase?.price ?? 0) * visibleRounds.length;
  const hostNetProfit = hostDropTotal - caseEntryCost;
  const guestNetProfit = guestDropTotal - caseEntryCost;
  const rewardIdsOwned = (activeRoom?.rewardInventoryIds ?? []).filter((id) => user.inventory.some((entry) => entry.instanceId === id));
  const rewardItems = [...(activeRoom?.hostItems ?? []), ...(activeRoom?.guestItems ?? [])].map((entry) => items.find((item) => item.id === entry.itemId)).filter((item): item is ItemCard => Boolean(item));
  const topBattleReward = rewardItems.sort((a, b) => b.price - a.price)[0];

  if (!isAuthorized) return <section className="rounded-2xl border border-white/10 bg-[#14161A] p-10 text-center"><Swords className="mx-auto mb-3 h-10 w-10 text-amber-300"/><h1 className="text-xl font-bold text-white">Батлы игроков</h1><p className="my-3 text-sm text-slate-400">Войди через Telegram, чтобы создавать комнаты и играть с друзьями.</p><button onClick={onOpenTelegramLogin} className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-slate-950">Войти через Telegram</button></section>;

  const winnerIsHost = activeRoom?.winnerUserId === activeRoom?.hostUserId;
  const winner = activeRoom?.winnerUserId ? {
    username: winnerIsHost ? activeRoom.hostUsername : activeRoom.guestUsername ?? 'Соперник',
    avatarUrl: winnerIsHost ? activeRoom.hostAvatarUrl : activeRoom.guestAvatarUrl,
    avatarColor: winnerIsHost ? activeRoom.hostAvatarColor : activeRoom.guestAvatarColor,
    netProfit: winnerIsHost ? hostNetProfit : guestNetProfit,
  } : null;

  return <>
  <div className="space-y-5">
    <section className="rounded-2xl border border-white/[0.07] bg-gradient-to-r from-[#171a20] to-[#111318] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-amber-300/10 p-3 text-amber-300"><Swords className="h-6 w-6"/></span><div><h1 className="text-2xl font-black text-white">Батлы</h1><p className="text-sm text-slate-400">Соревнуйся с другим игроком в кейсах или апгрейдах.</p></div></div>{'Notification' in window && Notification.permission === 'default' && <button onClick={onEnableNotifications} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]">Включить уведомления</button>}</div>
    </section>

    {invitations.length > 0 && <section className="space-y-2 rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-4"><h2 className="font-bold text-amber-100">Приглашения в батл</h2>{invitations.map((invite) => <div key={invite.id} className="flex flex-wrap items-center gap-2 text-sm"><span className="flex-1 text-white">{invite.fromUsername} зовёт в {invite.mode === 'cases' ? `батл кейсов (${invite.caseCount})` : 'батл апгрейдов'}</span><button disabled={!canAcceptInvite(invite)} title={!canAcceptInvite(invite) ? invite.mode === 'upgrade' ? 'Сначала выберите карточки для ставки ниже.' : 'Недостаточно TC для участия.' : undefined} onClick={() => void acceptInvite(invite)} className="rounded-lg bg-emerald-500/15 px-3 py-2 font-bold text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">Принять</button><button onClick={() => void declineInvite(invite.id)} className="rounded-lg bg-rose-500/10 px-3 py-2 font-bold text-rose-300">Отклонить</button></div>)}</section>}

    {error && <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}{notice && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}

    {activeRoom ? <section className="space-y-4 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs uppercase tracking-wider text-amber-300">{activeRoom.mode === 'cases' ? `Батл кейсов · ${activeRoom.caseCount} открытий` : 'Батл апгрейдов'}</div><h2 className="mt-1 text-xl font-bold text-white">{activeRoom.hostUsername} <span className="text-amber-300">VS</span> {activeRoom.guestUsername ?? 'Ожидаем игрока'}</h2></div>{activeRoom.status === 'waiting' && activeRoom.hostUserId === user.id && <button onClick={() => void cancelRoom()} className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">Отменить и вернуть ставку</button>}{activeRoom.status === 'completed' && <button type="button" onClick={() => { setActiveRoom(null); void refreshRooms(); }} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]">К комнатам</button>}</div>
      {activeRoom.status === 'waiting' ? <div className="grid gap-4 rounded-xl bg-[#0D0F12] p-4 md:grid-cols-[minmax(0,1fr)_260px] md:items-center"><div className="space-y-4"><div><p className="font-semibold text-white">Комната готова к батлу</p><p className="mt-1 text-sm text-slate-400">Ожидаем второго игрока. Батл начнётся автоматически после принятия комнаты.</p></div>{activeRoom.hostUserId === user.id && friends.length > 0 && <div className="flex flex-wrap gap-2"><select value={inviteFriendId} onChange={(event) => setInviteFriendId(event.target.value)} className="min-w-[180px] rounded-lg border border-white/10 bg-[#171a20] px-3 py-2 text-sm text-white"><option value="">Выбери друга</option>{friends.map((friend) => <option key={friend.id} value={friend.id}>{friend.telegramUsername ? `@${friend.telegramUsername}` : friend.username}</option>)}</select><button disabled={!inviteFriendId} onClick={() => void inviteFriend()} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">Пригласить друга</button></div>}</div><LoadingOverlay compact label="Ожидаем соперника"/></div> : <>
        {activeRoom.status === 'completed' && progress >= 1 && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#0D0F12] p-4"><Trophy className="h-5 w-5 text-amber-300"/><span className="font-bold text-white">{activeRoom.winnerUserId ? `Победитель: ${activeRoom.winnerUserId === user.id ? 'Вы' : activeRoom.winnerUserId === activeRoom.hostUserId ? activeRoom.hostUsername : activeRoom.guestUsername}` : 'Ничья — каждый получил свои дропы'}</span>{activeRoom.mode === 'upgrade' && <span className="text-xs text-slate-400">Шанс {activeRoom.hostUsername}: {activeRoom.hostWinChance?.toFixed(2)}%</span>}{rewardIdsOwned.length > 0 && <button type="button" disabled={selling} onClick={() => void sellBattleReward()} className="ml-auto rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300 disabled:cursor-wait disabled:opacity-50">{selling ? 'Продаём…' : `Продать выигрыш · ${rewardIdsOwned.length} карт.`}</button>}</div>}
        {activeRoom.mode === 'cases' && activeRoom.status === 'completed' && activeCase && activeRoom.roundResults?.[currentRoundIndex] ? <div className="grid gap-4 md:grid-cols-2"><BattleCaseLane playerName={activeRoom.hostUsername} caseBox={activeCase} pool={caseDropPool} drop={activeRoom.roundResults[currentRoundIndex].hostDrop} roundIndex={currentRoundIndex} startedAt={activeRoom.startedAt ?? Date.now()}/><BattleCaseLane playerName={activeRoom.guestUsername ?? 'Соперник'} caseBox={activeCase} pool={caseDropPool} drop={activeRoom.roundResults[currentRoundIndex].guestDrop} roundIndex={currentRoundIndex} startedAt={activeRoom.startedAt ?? Date.now()}/></div> : activeRoom.mode === 'upgrade' && activeRoom.status === 'completed' ? <div className="space-y-4"><BattleUpgradeWheel hostName={activeRoom.hostUsername} guestName={activeRoom.guestUsername ?? 'Соперник'} hostUserId={activeRoom.hostUserId} viewerUserId={user.id} hostChance={activeRoom.hostWinChance ?? 50} rollValue={activeRoom.rollValue ?? 0} winnerName={activeRoom.winnerUserId === activeRoom.hostUserId ? activeRoom.hostUsername : activeRoom.guestUsername ?? '—'} won={activeRoom.winnerUserId === user.id} startedAt={activeRoom.startedAt ?? Date.now()} rewardItem={topBattleReward}/><div className="grid gap-3 sm:grid-cols-2"><StakePanel label={activeRoom.hostUsername} value={activeRoom.hostStakeValue} items={items} inventory={activeRoom.hostItems ?? []}/><StakePanel label={activeRoom.guestUsername ?? 'Соперник'} value={activeRoom.guestStakeValue} items={items} inventory={activeRoom.guestItems ?? []}/></div></div> : null}
        <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-amber-300 to-orange-500 transition-[width] duration-500" style={{ width: `${activeRoom.status === 'completed' ? progress * 100 : 0}%` }}/></div>
        {activeRoom.mode === 'cases' && activeRoom.status === 'completed' && activeRoom.roundResults && <div className="space-y-3"><div className="text-right text-xs text-slate-500">{visibleRounds.length} / {activeRoom.caseCount} открытий завершено</div><div className="grid gap-3 sm:grid-cols-2"><ProfitSummary name={activeRoom.hostUsername} avatarUrl={activeRoom.hostAvatarUrl} avatarColor={activeRoom.hostAvatarColor} isViewer={activeRoom.hostUserId === user.id} caseCount={visibleRounds.length} dropsTotal={hostDropTotal} entryCost={caseEntryCost} netProfit={hostNetProfit}/><ProfitSummary name={activeRoom.guestUsername ?? 'Соперник'} avatarUrl={activeRoom.guestAvatarUrl} avatarColor={activeRoom.guestAvatarColor} isViewer={activeRoom.guestUserId === user.id} caseCount={visibleRounds.length} dropsTotal={guestDropTotal} entryCost={caseEntryCost} netProfit={guestNetProfit}/></div><div className="grid gap-2 sm:grid-cols-2">{visibleRounds.map((row, index) => { const hostRunning = visibleRounds.slice(0, index + 1).reduce((sum, entry) => sum + entry.hostDrop.price, 0) - (activeCase?.price ?? 0) * (index + 1); const guestRunning = visibleRounds.slice(0, index + 1).reduce((sum, entry) => sum + entry.guestDrop.price, 0) - (activeCase?.price ?? 0) * (index + 1); return <div key={row.round} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 rounded-lg border border-white/[0.04] bg-[#0D0F12] px-3 py-2 text-[11px]"><span className="text-slate-500">#{row.round}</span><span className="text-amber-200">{formatTC(row.hostDrop.price)} <small className="text-slate-500">· итог {hostRunning >= 0 ? '+' : ''}{formatTC(hostRunning)}</small></span><span className="text-slate-300">{formatTC(row.guestDrop.price)} <small className="text-slate-500">· итог {guestRunning >= 0 ? '+' : ''}{formatTC(guestRunning)}</small></span></div>; })}</div></div>}
      </>}</section> : <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.8fr)_1.2fr]">
      <section className="space-y-4 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5"><h2 className="flex items-center gap-2 font-bold text-white"><Swords className="h-4 w-4 text-amber-300"/> Создать комнату</h2>
        <div className="grid grid-cols-2 gap-2">{(['cases','upgrade'] as BattleMode[]).map((entry) => <button key={entry} onClick={() => setMode(entry)} className={`rounded-xl border p-3 text-sm font-bold ${mode === entry ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-white/10 text-slate-400'}`}>{entry === 'cases' ? 'Батл кейсов' : 'Батл апгрейдов'}</button>)}</div>
        {mode === 'cases' ? <><div className="space-y-2"><div className="text-xs text-slate-400">Выбери кейс</div><div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1">{cases.map((box) => <button key={box.id} type="button" onClick={() => setCaseId(box.id)} className={`rounded-xl border p-2 text-left transition-all ${caseId === box.id ? 'border-amber-300/60 bg-amber-300/[0.08] shadow-[0_0_18px_rgba(250,204,21,0.1)]' : 'border-white/[0.07] bg-[#0D0F12] hover:border-white/20'}`}><CaseThumbnail3D caseBox={box} className="mx-auto h-[74px] w-full object-contain"/><span className="mt-1 block truncate text-xs font-bold text-white">{box.name}</span><span className="mt-0.5 block text-[11px] text-amber-200">{formatTC(box.price)} TC</span></button>)}</div></div><label className="block space-y-1 text-xs text-slate-400">Открытий на игрока (максимум 25)<input type="number" min={1} max={25} value={caseCount} onChange={(event) => setCaseCount(Math.min(25, Math.max(1, Number(event.target.value) || 1)))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0D0F12] p-3 text-sm text-white"/></label><div className="flex items-center justify-between gap-2 rounded-lg bg-[#0D0F12] p-2 text-xs"><span className="text-slate-400">Взнос каждого игрока</span><b className="text-amber-200">{formatTC((selectedCase?.price ?? 0) * caseCount)} TC</b></div></> : <><p className="text-xs text-slate-400">Выбери карточки для ставки. Соперник сделает свою ставку при входе в комнату.</p><div className="grid max-h-[360px] grid-cols-2 gap-x-1 gap-y-3 overflow-y-auto rounded-xl bg-[#0D0F12] p-2 sm:grid-cols-3">{inventory.map(({ entry, item }) => <div key={entry.instanceId} className="flex justify-center"><CardFrame item={item} size="xs" selected={selectedIds.includes(entry.instanceId)} onClick={() => setSelectedIds((ids) => ids.includes(entry.instanceId) ? ids.filter((id) => id !== entry.instanceId) : [...ids, entry.instanceId])}/></div>)}</div><div className="flex items-center justify-between rounded-lg bg-[#0D0F12] p-2 text-xs"><span className="text-slate-400">Выбрано: {selectedIds.length} карт.</span><b className="text-amber-200">Ставка {formatTC(selectedValue)} TC</b></div></>}
        <label className="flex items-center gap-2 text-xs text-slate-400"><LockKeyhole className="h-4 w-4"/><input value={password} onChange={(event) => setPassword(event.target.value)} maxLength={32} placeholder="Пароль комнаты (необязательно)" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0D0F12] p-3 text-sm text-white"/></label>
        <button disabled={mode === 'cases' ? !selectedCase || (selectedCase.price * caseCount) > user.balance : selectedIds.length === 0} onClick={() => void createRoom()} className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">Создать комнату</button>
      </section>
      <section className="space-y-3 rounded-2xl border border-white/[0.07] bg-[#14161A] p-5"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold text-white"><Users className="h-4 w-4 text-amber-300"/> Открытые комнаты</h2><button onClick={() => void refreshRooms()} aria-label="Обновить комнаты" className="rounded-lg p-2 text-slate-400 hover:bg-white/5"><RefreshCw className="h-4 w-4"/></button></div>
        {rooms.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Сейчас нет открытых комнат. Создай первую!</p> : rooms.map((room) => <div key={room.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0D0F12] p-3"><div className="flex-1"><div className="flex items-center gap-2 text-sm font-bold text-white">{room.mode === 'cases' ? 'Батл кейсов' : 'Батл апгрейдов'}{room.hasPassword && <LockKeyhole className="h-3 w-3 text-slate-500"/>}</div><div className="mt-1 text-xs text-slate-400">{room.hostUsername}</div></div><button disabled={!canJoin(room)} title={!canJoin(room) ? room.mode === 'upgrade' ? 'Сначала выберите карточки для ставки.' : 'Недостаточно TC для участия.' : undefined} onClick={() => promptAndJoin(room)} className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Принять</button></div>)}
      </section></div>}
  </div>
  {activeRoom?.status === 'completed' && progress >= 1 && !winnerDismissed && <BattleWinnerOverlay winner={winner} host={{ username: activeRoom.hostUsername, avatarUrl: activeRoom.hostAvatarUrl, avatarColor: activeRoom.hostAvatarColor, netProfit: hostNetProfit }} guest={{ username: activeRoom.guestUsername ?? 'Соперник', avatarUrl: activeRoom.guestAvatarUrl, avatarColor: activeRoom.guestAvatarColor, netProfit: guestNetProfit }} isViewerWinner={activeRoom.winnerUserId === user.id} isDraw={!activeRoom.winnerUserId} caseBattle={activeRoom.mode === 'cases'} prizeValue={activeRoom.hostStakeValue + activeRoom.guestStakeValue} onClose={() => setWinnerDismissed(true)}/>}
  </>;
};

function ProfitSummary({ name, avatarUrl, avatarColor, isViewer, caseCount, dropsTotal, entryCost, netProfit }: { name: string; avatarUrl?: string; avatarColor?: string; isViewer: boolean; caseCount: number; dropsTotal: number; entryCost: number; netProfit: number }) {
  return <section className={`rounded-xl border p-3 ${isViewer ? 'border-amber-300/25 bg-amber-300/[0.045]' : 'border-white/[0.07] bg-[#0D0F12]'}`}>
    <div className="flex items-center gap-2"><span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-700">{avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover"/> : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: avatarColor || '#475569' }}>{name.slice(0, 2).toUpperCase()}</span>}</span><div className="min-w-0 flex-1"><div className={`truncate text-sm font-bold ${isViewer ? 'text-amber-200' : 'text-slate-300'}`}>{isViewer ? 'Твоя прибыль' : 'Соперник'} · {name}</div><div className="text-[11px] text-slate-500">Итог за {caseCount} раундов</div></div><b className={`text-lg ${netProfit >= 0 ? isViewer ? 'text-amber-200' : 'text-slate-200' : 'text-rose-300'}`}>{netProfit >= 0 ? '+' : ''}{formatTC(netProfit)} <small className="text-xs">TC</small></b></div>
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-2 text-[11px]"><span className="text-slate-500">Дропы <b className="text-slate-300">{formatTC(dropsTotal)} TC</b></span><span className="text-right text-slate-500">Взносы <b className="text-slate-300">−{formatTC(entryCost)} TC</b></span></div>
  </section>;
}

function StakePanel({ label, value, items, inventory }: { label: string; value: number; items: ItemCard[]; inventory: UserProfile['inventory'] }) {
  return <div className="rounded-xl bg-[#0D0F12] p-4"><div className="flex justify-between text-sm font-bold text-white"><span>{label}</span><span className="text-amber-200">{formatTC(value)} TC</span></div><div className="mt-3 flex flex-wrap gap-2">{inventory.map((entry) => { const card = items.find((item) => item.id === entry.itemId); return card ? <div key={entry.instanceId} title={card.name} className="rounded-lg bg-white/[0.04] p-2"><img src={card.imageUrl} alt={card.name} className="h-12 w-16 object-contain"/></div> : null; })}</div><Shield className="mt-3 h-4 w-4 text-slate-600"/></div>;
}
