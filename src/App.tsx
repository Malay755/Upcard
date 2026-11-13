import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { AppTab, BootstrapPayload, FriendProfile, LiveDropEntry, Rarity, RollMode } from './types';
import { soundFX } from './utils/sound';
import { Header } from './components/Header';
import { TopDropsSidebar } from './components/TopDropsSidebar';
import { DepositModal } from './components/DepositModal';
import {
  TelegramLoginModal,
  type TelegramAuthSuccessResult,
} from './components/TelegramLoginModal';

const UpgradeArena = lazy(() => import('./components/UpgradeArena').then((m) => ({ default: m.UpgradeArena })));
const CasesView = lazy(() => import('./components/CasesView').then((m) => ({ default: m.CasesView })));
const BonusesView = lazy(() => import('./components/BonusesView').then((m) => ({ default: m.BonusesView })));
const ProfileView = lazy(() => import('./components/ProfileView').then((m) => ({ default: m.ProfileView })));
const AdminView = lazy(() => import('./components/AdminView').then((m) => ({ default: m.AdminView })));
const BattlesView = lazy(() => import('./components/BattlesView').then((m) => ({ default: m.BattlesView })));

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Ошибка запроса к серверу.');
  }
  return data as T;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('upgrade');
  const [payload, setPayload] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [depositOpen, setDepositOpen] = useState(false);
  const [telegramLoginOpen, setTelegramLoginOpen] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [muted, setMuted] = useState(false);
  const [liveDrops, setLiveDrops] = useState<LiveDropEntry[]>([]);
  const [friendInviteNotice, setFriendInviteNotice] = useState('');
  const [realtimeNotice, setRealtimeNotice] = useState<{ text: string; tab: AppTab } | null>(null);
  const handledInviteCode = useRef('');

  const loadBootstrap = useCallback(async () => {
    try {
      // Auto-authenticate when opened inside a Telegram Bot Mini App (Telegram.WebApp.initData)
      const win = window as unknown as {
        Telegram?: { WebApp?: { initData?: string; ready?: () => void } };
      };
      const tgInitData = win.Telegram?.WebApp?.initData;
      const current = await apiJson<BootstrapPayload>('/api/bootstrap');
      if (current.authenticated) {
        setPayload(current);
        setIsAuthorized(true);
        setLoadError('');
        return;
      }

      if (tgInitData) {
        try {
          win.Telegram?.WebApp?.ready?.();
          const webAppRes = await fetch('/api/auth/telegram/verify-webapp', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tgInitData }),
          });
          if (webAppRes.ok) {
            const authData = (await webAppRes.json()) as TelegramAuthSuccessResult;
            setPayload(authData.payload);
            setIsAuthorized(true);
            setLoadError('');
            return;
          }
        } catch {
          // Fall through to standard bootstrap
        }
      }

      setPayload(current);
      setIsAuthorized(false);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить данные.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPayload = useCallback(async () => {
    try {
      const current = await apiJson<BootstrapPayload>('/api/bootstrap');
      if (current.authenticated) setPayload(current);
    } catch {
      // Keep the current session visible while a transient refresh fails.
    }
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (!isAuthorized) return;
    let stopped = false;
    let retryTimer = 0;
    let socket: WebSocket | null = null;
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`);
      socket.onmessage = (event) => {
        let message: { type?: string; username?: string } = {};
        try { message = JSON.parse(event.data); } catch { return; }
        const noticeTypes: Record<string, { text: string; tab: AppTab }> = {
          friend_request: { text: `${message.username ?? 'Игрок'} отправил запрос в друзья`, tab: 'profile' },
          friend_request_accepted: { text: `${message.username ?? 'Игрок'} принял запрос в друзья`, tab: 'profile' },
          battle_invitation: { text: `${message.username ?? 'Друг'} приглашает тебя в батл`, tab: 'battles' },
          battle_invitation_accepted: { text: `${message.username ?? 'Игрок'} принял приглашение в батл`, tab: 'battles' },
          battle_invitation_declined: { text: `${message.username ?? 'Игрок'} отклонил приглашение в батл`, tab: 'battles' },
          battle_invitation_expired: { text: 'Приглашение в батл устарело: комната уже занята', tab: 'battles' },
        };
        if (message.type && noticeTypes[message.type]) {
          setRealtimeNotice(noticeTypes[message.type]);
          soundFX.playCoin();
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            const notification = new Notification('UPGRADER', { body: noticeTypes[message.type].text, tag: message.type });
            notification.onclick = () => { window.focus(); setActiveTab(noticeTypes[message.type!].tab); notification.close(); };
          }
          void refreshPayload();
        }
      };
      socket.onclose = () => { if (!stopped) retryTimer = window.setTimeout(connect, 2500); };
    };
    connect();
    const poll = window.setInterval(() => { void refreshPayload(); }, 8000);
    return () => { stopped = true; window.clearTimeout(retryTimer); window.clearInterval(poll); socket?.close(); };
  }, [isAuthorized, refreshPayload]);

  useEffect(() => {
    if (payload) setLiveDrops(payload.liveDrops);
  }, [payload?.liveDrops]);

  useEffect(() => {
    let stopped = false;
    const refreshDrops = async () => {
      try {
        const result = await apiJson<{ liveDrops: LiveDropEntry[] }>('/api/live-drops');
        if (!stopped) setLiveDrops(result.liveDrops);
      } catch {
        // Keep showing the last successfully loaded feed while the network is unavailable.
      }
    };
    void refreshDrops();
    const interval = window.setInterval(refreshDrops, 10_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, []);

  const handleToggleMute = () => {
    soundFX.muted = !muted;
    setMuted(!muted);
  };

  const handleTelegramAuthenticated = (result: TelegramAuthSuccessResult) => {
    setPayload(result.payload);
    setIsAuthorized(true);
    soundFX.playCoin();
  };

  const handleLogout = async () => {
    try {
      await apiJson('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear local session regardless
    }
    setIsAuthorized(false);
    await loadBootstrap();
  };

  const handleCredit = async (amount: number) => {
    if (!payload) throw new Error('Пользователь не загружен.');
    const res = await apiJson<{ payload: BootstrapPayload; credited: number }>('/api/finance/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    setPayload(res.payload);
    soundFX.playCoin();
    return res.credited;
  };

  const openDeposit = () => {
    if (!isAuthorized) { setTelegramLoginOpen(true); return; }
    setDepositOpen(true);
  };

  const enableNotifications = () => {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  };

  const handleRollUpgrade = async (params: {
    instanceIds: string[];
    balanceAdded: number;
    targetItemId: string;
    mode: RollMode;
  }) => {
    if (!payload) throw new Error('Пользователь не загружен.');
    const res = await apiJson<{
      payload: BootstrapPayload;
      result: {
        won: boolean;
        rollValue: number;
        targetItem: BootstrapPayload['items'][number];
      };
    }>('/api/upgrade/roll', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return {
      ...res.result,
      commitResult: () => setPayload(res.payload),
    };
  };

  const handleSellItems = async (instanceIds: string[]) => {
    if (!payload) return;
    const res = await apiJson<{ payload: BootstrapPayload }>('/api/inventory/sell', {
      method: 'POST',
      body: JSON.stringify({ instanceIds }),
    });
    setPayload(res.payload);
  };

  const handleOpenCase = async (caseId: string) => {
    if (!payload) throw new Error('Пользователь не загружен.');
    const res = await apiJson<{
      payload: BootstrapPayload;
      drop: {
        item: BootstrapPayload['items'][number];
        instance: BootstrapPayload['user']['inventory'][number];
      };
    }>('/api/cases/open', {
      method: 'POST',
      body: JSON.stringify({ caseId }),
    });
    setPayload(res.payload);
    return res.drop;
  };

  const handleClaimDaily = async () => {
    if (!payload) throw new Error('Пользователь не загружен.');
    const res = await apiJson<{
      payload: BootstrapPayload;
      reward: number;
      streakDay: number;
    }>('/api/bonus/daily', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setPayload(res.payload);
    return { reward: res.reward, streakDay: res.streakDay };
  };

  const handleApplyReferral = async (code: string) => {
    if (!payload) throw new Error('Пользователь не загружен.');
    const res = await apiJson<{ payload: BootstrapPayload; bonus: number }>('/api/referral/apply', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    setPayload(res.payload);
    return { bonus: res.bonus };
  };

  const handleAddFriend = async (code: string) => {
    const res = await apiJson<{ payload: BootstrapPayload; requestSent?: boolean }>('/api/friends', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    setPayload(res.payload);
    return res.payload;
  };

  const handleFriendRequest = async (id: string, accept: boolean) => {
    const res = await apiJson<{ payload: BootstrapPayload }>(`/api/friends/requests/${encodeURIComponent(id)}${accept ? '/accept' : ''}`, {
      method: accept ? 'POST' : 'DELETE', body: accept ? JSON.stringify({}) : undefined,
    });
    setPayload(res.payload);
  };

  const handleRemoveFriend = async (friendId: string) => {
    const res = await apiJson<{ payload: BootstrapPayload }>(`/api/friends/${encodeURIComponent(friendId)}`, {
      method: 'DELETE',
    });
    setPayload(res.payload);
  };

  const handleGetFriendProfile = async (friendId: string): Promise<FriendProfile> => {
    const res = await apiJson<{ profile: FriendProfile }>(
      `/api/friends/${encodeURIComponent(friendId)}/profile`
    );
    return res.profile;
  };

  useEffect(() => {
    if (!isAuthorized || !payload) return;
    const code = new URLSearchParams(window.location.search).get('friend')?.trim().toUpperCase();
    if (!code || handledInviteCode.current === code) return;
    handledInviteCode.current = code;
    void handleAddFriend(code)
      .then(() => setFriendInviteNotice('Запрос отправлен. Он появится в друзьях после согласия получателя.'))
      .catch((error: unknown) => setFriendInviteNotice(error instanceof Error ? error.message : 'Не удалось отправить запрос.'))
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('friend');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      });
  }, [isAuthorized, payload?.user.id]);

  const handleCreateItem = async (data: {
    name: string;
    rarity: Rarity;
    price: number;
    imageUrl: string;
    caseIds: string[];
  }) => {
    const res = await apiJson<{
      item: BootstrapPayload['items'][number];
      items: BootstrapPayload['items'];
      cases: BootstrapPayload['cases'];
    }>('/api/admin/items', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setPayload((prev) => (prev ? { ...prev, items: res.items, cases: res.cases } : prev));
    return res.item;
  };

  const handleDeleteItem = async (id: string) => {
    await apiJson(`/api/admin/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadBootstrap();
  };

  const handleGrantItem = async (itemId: string) => {
    if (!payload) return;
    const res = await apiJson<{ payload: BootstrapPayload }>('/api/admin/grant', {
      method: 'POST',
      body: JSON.stringify({ itemId }),
    });
    setPayload(res.payload);
  };

  const handleCreateCase = async (data: {
    name: string;
    description: string;
    price: number;
    tier: Rarity;
    imageUrl: string;
    itemIds: string[];
    rarityWeights: Record<Rarity, number>;
  }) => {
    const res = await apiJson<{ cases: BootstrapPayload['cases'] }>('/api/admin/cases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setPayload((prev) => (prev ? { ...prev, cases: res.cases } : prev));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0D10] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-[#FACC15]/20 border-t-[#FACC15] animate-spin" />
      </div>
    );
  }

  if (loadError || !payload) {
    return (
      <div className="min-h-screen bg-[#0B0D10] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <p className="text-rose-400 font-medium">{loadError || 'Ошибка загрузки.'}</p>
        <button
          type="button"
          onClick={() => loadBootstrap()}
          className="px-4 py-2 rounded-xl bg-[#FACC15] text-[#0B0D10] font-bold text-sm cursor-pointer"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col text-slate-100">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={payload.user}
        isAuthorized={isAuthorized}
        onOpenTelegramLogin={() => setTelegramLoginOpen(true)}
        onOpenDeposit={openDeposit}
        onLogout={handleLogout}
        muted={muted}
        onToggleMute={handleToggleMute}
      />

      <div className="flex min-h-0 flex-1">
      <TopDropsSidebar liveDrops={liveDrops} items={payload.items} />
      <main className="flex-1 min-w-0 max-w-[1320px] w-full mx-auto px-4 sm:px-6 py-5">
        <Suspense fallback={<div className="min-h-[40vh]" role="status">Загрузка раздела…</div>}>
        <div key={activeTab} className="animate-tab-enter">
          {activeTab === 'upgrade' && (
            <UpgradeArena
              user={payload.user}
              items={payload.items}
              isAuthorized={isAuthorized}
              onOpenTelegramLogin={() => setTelegramLoginOpen(true)}
              onRollUpgrade={handleRollUpgrade}
              onSellItems={handleSellItems}
              onGoToCases={() => setActiveTab('cases')}
              muted={muted}
              onToggleMute={handleToggleMute}
            />
          )}

          {activeTab === 'cases' && (
            <CasesView
              user={payload.user}
              isAuthorized={isAuthorized}
              cases={payload.cases}
              items={payload.items}
              onOpenTelegramLogin={() => setTelegramLoginOpen(true)}
              onOpenCase={handleOpenCase}
              onSellItems={handleSellItems}
              onOpenDeposit={openDeposit}
              onGoToCreateCase={() => setActiveTab('admin')}
            />
          )}

          {activeTab === 'bonuses' && (
            <BonusesView
              user={payload.user}
              onClaimDaily={handleClaimDaily}
              onApplyReferral={handleApplyReferral}
            />
          )}

          {activeTab === 'battles' && (
            <BattlesView
              user={payload.user}
              items={payload.items}
              cases={payload.cases}
              friends={payload.friends}
              invitations={payload.battleInvitations}
              isAuthorized={isAuthorized}
              onOpenTelegramLogin={() => setTelegramLoginOpen(true)}
              onEnableNotifications={enableNotifications}
              onSellItems={handleSellItems}
              onPayload={setPayload}
            />
          )}

          {activeTab === 'profile' && (
        <ProfileView
              user={payload.user}
              isAuthorized={isAuthorized}
              items={payload.items}
              transactions={payload.transactions}
              upgradeHistory={payload.upgradeHistory}
              friends={payload.friends}
              friendRequestsReceived={payload.friendRequestsReceived}
              friendInviteNotice={friendInviteNotice}
              onOpenTelegramLogin={() => setTelegramLoginOpen(true)}
              onSellItems={handleSellItems}
              onOpenDeposit={openDeposit}
              onGoToUpgrade={() => setActiveTab('upgrade')}
              onAddFriend={handleAddFriend}
              onAcceptFriendRequest={(id) => handleFriendRequest(id, true)}
              onDeclineFriendRequest={(id) => handleFriendRequest(id, false)}
              onRemoveFriend={handleRemoveFriend}
              onGetFriendProfile={handleGetFriendProfile}
            />
          )}

          {activeTab === 'admin' && (
            <AdminView
              items={payload.items}
              cases={payload.cases}
              onCreateItem={handleCreateItem}
              onDeleteItem={handleDeleteItem}
              onGrantItem={handleGrantItem}
              onCreateCase={handleCreateCase}
            />
          )}
        </div>
        </Suspense>
      </main>
      </div>

      <footer className="border-t border-white/[0.06] py-4 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-[1320px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>UPGRADER · Оффлайн платформа апгрейдов и кейсов на Т-коинах</span>
          <span>Валюта Т-коин является вымышленной и не имеет реальной денежной ценности</span>
        </div>
      </footer>

      <DepositModal
        isOpen={depositOpen}
        onClose={() => setDepositOpen(false)}
        onCredit={handleCredit}
      />

      {realtimeNotice && <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-amber-300/20 bg-[#171a20] p-4 shadow-2xl">
        <span className="flex-1 text-sm text-white">{realtimeNotice.text}</span>
        <button type="button" onClick={() => { setActiveTab(realtimeNotice.tab); setRealtimeNotice(null); }} className="whitespace-nowrap rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950">Открыть</button>
        <button type="button" onClick={() => setRealtimeNotice(null)} aria-label="Закрыть уведомление" className="text-slate-500">×</button>
      </div>}

      <TelegramLoginModal
        isOpen={telegramLoginOpen}
        onClose={() => setTelegramLoginOpen(false)}
        onAuthenticated={handleTelegramAuthenticated}
      />
    </div>
  );
}
