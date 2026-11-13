import React, { useEffect, useState } from 'react';
import { Check, Copy, Gift, Share2, Users } from 'lucide-react';
import type { UserProfile } from '../types';
import { DAILY_STREAK_REWARDS, formatTC } from '../utils/economics';
import { soundFX } from '../utils/sound';

interface BonusesViewProps {
  user: UserProfile;
  onClaimDaily: () => Promise<{ reward: number; streakDay: number }>;
  onApplyReferral: (code: string) => Promise<{ bonus: number }>;
}

export const BonusesView: React.FC<BonusesViewProps> = ({
  user,
  onClaimDaily,
  onApplyReferral,
}) => {
  const [now, setNow] = useState(Date.now());
  const [claiming, setClaiming] = useState(false);
  const [dailyMessage, setDailyMessage] = useState('');
  const [refInput, setRefInput] = useState('');
  const [refMessage, setRefMessage] = useState('');
  const [refError, setRefError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const cooldownMs = 24 * 60 * 60 * 1000;
  const elapsed = user.lastDailyClaimAt ? now - user.lastDailyClaimAt : cooldownMs + 1;
  const canClaim = elapsed >= cooldownMs;
  const remainingMs = Math.max(0, cooldownMs - elapsed);

  const formatRemaining = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const currentStreakCycleDay = (user.dailyStreak % 7); // 0..6 completed in current cycle

  const handleClaim = async () => {
    if (!canClaim || claiming) return;
    setClaiming(true);
    setDailyMessage('');
    try {
      const res = await onClaimDaily();
      soundFX.playCoin();
      setDailyMessage(`Начислено +${formatTC(res.reward)} Т-коин (День ${res.streakDay})`);
    } finally {
      setClaiming(false);
    }
  };

  const handleCopyCode = async () => {
    const shareText = `${window.location.origin}/?ref=${user.referralCode}`;
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      // Fallback ignored in restricted environments
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyRef = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefError('');
    setRefMessage('');
    try {
      const res = await onApplyReferral(refInput);
      soundFX.playCoin();
      setRefMessage(`Код активирован! Начислено +${formatTC(res.bonus)} Т-коин.`);
      setRefInput('');
    } catch (err) {
      setRefError(err instanceof Error ? err.message : 'Не удалось активировать код.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
          Ежедневные бонусы и рефералы
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Заходите каждые 24 часа за нарастающей наградой и получайте процент с депозитов друзей.
        </p>
      </div>

      {/* 7-Day Progressive Daily Bonus */}
      <section className="bg-[#14161A] border border-white/[0.07] rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-display font-bold text-white">
              Календарь ежедневных наград
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Текущая серия: <span className="font-mono-num text-[#FACC15] font-semibold">{user.dailyStreak} дн.</span>
            </p>
          </div>

          <button
            type="button"
            disabled={!canClaim || claiming}
            onClick={handleClaim}
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Gift className="w-4 h-4" />
            {canClaim ? (
              <span>Забрать +{formatTC(DAILY_STREAK_REWARDS[currentStreakCycleDay])} TC</span>
            ) : (
              <span className="font-mono-num">До следующего: {formatRemaining(remainingMs)}</span>
            )}
          </button>
        </div>

        {dailyMessage && (
          <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5">
            {dailyMessage}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {DAILY_STREAK_REWARDS.map((reward, idx) => {
            const dayNumber = idx + 1;
            const isClaimed = idx < currentStreakCycleDay;
            const isNext = idx === currentStreakCycleDay;
            return (
              <div
                key={dayNumber}
                className={`rounded-xl border p-4 flex flex-col justify-between transition-colors ${
                  isNext && canClaim
                    ? 'bg-amber-500/10 border-amber-500/60'
                    : isClaimed
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-[#0D0F12] border-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">День {dayNumber}</span>
                  {isClaimed && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div className="mt-3">
                  <div className="text-lg font-mono-num font-bold text-white">
                    +{formatTC(reward)}
                  </div>
                  <div className="text-[11px] text-slate-400">Т-коин</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Referral Program */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-[#14161A] border border-white/[0.07] rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-display font-bold text-white">
                Реферальная программа
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Друг получает +300 TC при активации кода, а вы — +150 TC и 5% от всех его пополнений.
              </p>
            </div>
            <Users className="w-5 h-5 text-[#FACC15] shrink-0" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#0D0F12] border border-white/[0.06] rounded-xl p-4">
              <div className="text-xs text-slate-400">Приглашено друзей</div>
              <div className="text-2xl font-mono-num font-bold text-white mt-1">
                {user.referralCount}
              </div>
            </div>
            <div className="bg-[#0D0F12] border border-white/[0.06] rounded-xl p-4">
              <div className="text-xs text-slate-400">Реферальный доход</div>
              <div className="text-2xl font-mono-num font-bold text-emerald-400 mt-1">
                +{formatTC(user.referralEarned)} TC
              </div>
            </div>
            <div className="bg-[#0D0F12] border border-white/[0.06] rounded-xl p-4">
              <div className="text-xs text-slate-400">Ваш процент</div>
              <div className="text-2xl font-mono-num font-bold text-[#FACC15] mt-1">5%</div>
            </div>
          </div>

          <div className="bg-[#0D0F12] border border-white/[0.08] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-400">Ваш реферальный код</div>
              <div className="text-lg font-mono-num font-bold text-white tracking-wide mt-0.5">
                {user.referralCode}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</span>
            </button>
          </div>
        </section>

        {/* Apply Referral Code */}
        <section className="lg:col-span-5 bg-[#14161A] border border-white/[0.07] rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Share2 className="w-4 h-4 text-[#FACC15]" />
              <h2 className="text-lg font-display font-bold text-white">
                Активировать код друга
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Введите код пригласившего игрока (например, <span className="font-mono-num text-slate-200">DRIP-MASTER</span>) и получите +300 Т-коин.
            </p>
          </div>

          {user.referredByCode ? (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 text-sm text-emerald-300">
              Вы уже привязаны к реферальному коду{' '}
              <span className="font-mono-num font-bold">{user.referredByCode}</span>.
            </div>
          ) : (
            <form onSubmit={handleApplyRef} className="space-y-3">
              <div>
                <label htmlFor="ref-code-input" className="block text-xs text-slate-300 mb-1.5">
                  Реферальный код
                </label>
                <input
                  id="ref-code-input"
                  type="text"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  placeholder="DRIP-MASTER"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0D0F12] border border-white/10 text-white uppercase font-mono-num text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              {refError && <p className="text-xs text-rose-400">{refError}</p>}
              {refMessage && <p className="text-xs text-emerald-400">{refMessage}</p>}
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-semibold text-sm transition-colors cursor-pointer"
              >
                Получить +300 Т-коин
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};
