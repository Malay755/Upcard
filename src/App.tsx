import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { AppTab, BootstrapPayload, Rarity, RollMode } from './types';
import { soundFX } from './utils/sound';
import { Header } from './components/Header';
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

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

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

  const handleDeposit = async (amount: number, method: string, promoCode: string) => {
    if (!payload) throw new Error('Пользователь не загружен.');
    const res = await apiJson<{
      payload: BootstrapPayload;
      receipt: {
        txId: string;
        method: string;
        baseAmount: number;
        bonusAmount: number;
        totalCredited: number;
        appliedPromo: string | null;
      };
    }>('/api/finance/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount, method, promoCode }),
    });
    setPayload(res.payload);
    return res.receipt;
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
        onLogout={handleLogout}
        muted={muted}
        onToggleMute={handleToggleMute}
      />

      <main className="flex-1 max-w-[1320px] w-full mx-auto px-4 sm:px-6 py-5">
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
              onOpenDeposit={() => setDepositOpen(true)}
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

          {activeTab === 'profile' && (
        <ProfileView
              user={payload.user}
              isAuthorized={isAuthorized}
              items={payload.items}
              transactions={payload.transactions}
              upgradeHistory={payload.upgradeHistory}
              onOpenTelegramLogin={() => setTelegramLoginOpen(true)}
              onSellItems={handleSellItems}
              onOpenDeposit={() => setDepositOpen(true)}
              onGoToUpgrade={() => setActiveTab('upgrade')}
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

      <footer className="border-t border-white/[0.06] py-4 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-[1320px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>UPGRADER · Оффлайн платформа апгрейдов и кейсов на Т-коинах</span>
          <span>Валюта Т-коин является вымышленной и не имеет реальной денежной ценности</span>
        </div>
      </footer>

      <DepositModal
        isOpen={depositOpen}
        onClose={() => setDepositOpen(false)}
        onDeposit={handleDeposit}
      />

      <TelegramLoginModal
        isOpen={telegramLoginOpen}
        onClose={() => setTelegramLoginOpen(false)}
        onAuthenticated={handleTelegramAuthenticated}
      />
    </div>
  );
}
