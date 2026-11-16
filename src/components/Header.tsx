import React, { useEffect, useState } from 'react';
import { Coins, LogOut, Volume2, VolumeX } from 'lucide-react';
import type { AppTab, UserProfile } from '../types';
import { TelegramPaperPlaneIcon } from './TelegramLoginModal';
import { GoatLogo } from './GoatLogo';
import { formatTC } from '../utils/economics';

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  user: UserProfile;
  isAuthorized: boolean;
  onOpenTelegramLogin: () => void;
  onOpenEarn: () => void;
  onLogout: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

const NAV_ITEMS: { id: AppTab; label: string }[] = [
  { id: 'upgrade', label: 'Апгрейд' },
  { id: 'contracts', label: 'Контракты' },
  { id: 'cases', label: 'Кейсы' },
  { id: 'battles', label: 'Батлы' },
  { id: 'bonuses', label: 'Бонусы' },
  { id: 'profile', label: 'Профиль' },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  user,
  isAuthorized,
  onOpenTelegramLogin,
  onOpenEarn,
  onLogout,
  muted,
  onToggleMute,
}) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateScrolled = () => setScrolled(window.scrollY > 12);
    updateScrolled();
    window.addEventListener('scroll', updateScrolled, { passive: true });
    return () => window.removeEventListener('scroll', updateScrolled);
  }, []);

  return (
    <header className={`sticky top-0 z-40 border-b border-white/[0.06] transition-[background-color,box-shadow] duration-300 ${scrolled ? 'bg-[#0D0F12] shadow-lg shadow-black/30' : 'bg-[#0D0F12]'}`}>
      <div className="max-w-[1320px] mx-auto w-full px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand */}
        <div className="flex items-center min-w-0">
          <button
            type="button"
            onClick={() => onTabChange('upgrade')}
            className="flex items-center gap-2 text-base font-display font-extrabold tracking-wider text-white hover:text-[#FACC15] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <GoatLogo className="h-8 w-8 text-[#FACC15]" />
            <span>Ферма</span>
          </button>
        </div>

        {/* Center Zone: Clean Single-Line Navigation */}
        <nav aria-label="Основная навигация" className="hidden md:flex items-center gap-7">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`relative py-2 text-xs font-display font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-[#FACC15] drop-shadow-[0_0_8px_rgba(250,204,21,0.35)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="nav-underline absolute inset-x-0 -bottom-[11px] h-[2px] bg-[#FACC15] shadow-[0_0_8px_rgba(250,204,21,0.8)] rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Zone: Balance + Mute + Telegram Sign-In / Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenEarn}
            aria-label="Заработать TC"
            className="inline-flex md:hidden items-center gap-1 rounded-lg bg-[#FACC15] px-2.5 py-1.5 min-h-[36px] text-[11px] font-bold text-[#0B0D10] active:scale-95 transition-transform whitespace-nowrap cursor-pointer"
          >
            <Coins className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono-num">{formatTC(user.balance)}</span>
            <span className="opacity-85">+TC</span>
          </button>

          <button type="button" onClick={onOpenEarn} className="hidden md:inline-flex items-center gap-2 rounded-lg bg-[#FACC15] px-3 py-2 text-xs font-bold text-[#0B0D10] transition-colors hover:bg-[#FDE047] whitespace-nowrap cursor-pointer">
            <Coins className="h-3.5 w-3.5" /><span>Заработать TC</span><span className="border-l border-black/20 pl-2 font-mono-num">{formatTC(user.balance)} TC</span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-[#FACC15] rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {isAuthorized ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => onTabChange('profile')}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg bg-[#161920] hover:bg-[#1E222C] border border-white/10 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {user.telegramPhotoUrl ? (
                  <img
                    src={user.telegramPhotoUrl}
                    alt={user.username}
                    className="w-5 h-5 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-[#2AABEE] text-white flex items-center justify-center shrink-0">
                    <TelegramPaperPlaneIcon className="w-2.5 h-2.5" />
                  </span>
                )}
                <span className="max-w-[92px] sm:max-w-[120px] truncate">
                  {user.telegramUsername ? `@${user.telegramUsername}` : user.username}
                </span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                title="Выйти из Telegram"
                aria-label="Выйти из Telegram"
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-[#161920] hover:bg-rose-500/15 border border-white/[0.06] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="header-telegram-login"
              onClick={onOpenTelegramLogin}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 min-h-[36px] rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-display font-bold text-xs transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer shadow-[0_0_20px_rgba(250,204,21,0.18)]"
            >
              <TelegramPaperPlaneIcon className="w-3.5 h-3.5" />
              <span>Войти</span>
            </button>
          )}
        </div>
      </div>

      {/* Full-visibility 3x2 Mobile Nav Grid */}
      <nav
        aria-label="Мобильная навигация"
        className="grid grid-cols-3 gap-1.5 md:hidden border-t border-white/[0.06] px-2.5 py-2 bg-[#0D0F12]"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[40px] w-full flex items-center justify-center px-2 py-2 text-[11px] font-display font-bold uppercase tracking-wider rounded-lg border transition-colors active:scale-[0.97] whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'text-[#FACC15] bg-[#FACC15]/14 border-[#FACC15]/35 shadow-[0_0_12px_rgba(250,204,21,0.14)]'
                  : 'text-slate-300 bg-[#14161A] border-white/[0.06] hover:text-white'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
