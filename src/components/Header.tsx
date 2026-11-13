import React, { useEffect, useState } from 'react';
import { LogOut, Volume2, VolumeX } from 'lucide-react';
import type { AppTab, UserProfile } from '../types';
import { TelegramPaperPlaneIcon } from './TelegramLoginModal';

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  user: UserProfile;
  isAuthorized: boolean;
  onOpenTelegramLogin: () => void;
  onLogout: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

const NAV_ITEMS: { id: AppTab; label: string }[] = [
  { id: 'upgrade', label: 'Апгрейд' },
  { id: 'cases', label: 'Кейсы' },
  { id: 'bonuses', label: 'Бонусы' },
  { id: 'profile', label: 'Профиль' },
  { id: 'admin', label: 'Админ' },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  user,
  isAuthorized,
  onOpenTelegramLogin,
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
    <header className={`sticky top-0 z-40 border-b border-white/[0.06] backdrop-blur-md transition-[background-color,box-shadow] duration-300 ${scrolled ? 'bg-[#0D0F12]/95 shadow-lg shadow-black/20' : 'bg-[#0D0F12]/80'}`}>
      <div className="max-w-[1320px] mx-auto w-full px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Left Zone: ^^ UPGRADER Brand */}
        <div className="flex items-center min-w-0">
          <button
            type="button"
            onClick={() => onTabChange('upgrade')}
            className="flex items-center gap-2 text-base font-display font-extrabold tracking-wider text-white hover:text-[#FACC15] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#FACC15]" fill="currentColor" aria-hidden="true">
              <path d="M12 4L4 11.5L6.2 13.7L12 8.2L17.8 13.7L20 11.5L12 4Z" />
              <path d="M12 10.5L4 18L6.2 20.2L12 14.7L17.8 20.2L20 18L12 10.5Z" opacity="0.6" />
            </svg>
            <span className="uppercase">UPGRADER</span>
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

        {/* Right Zone: Mute + Telegram Sign-In / Profile */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            className="p-2 text-slate-400 hover:text-[#FACC15] rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {isAuthorized ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onTabChange('profile')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#161920] hover:bg-[#1E222C] border border-white/10 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                <span className="max-w-[120px] truncate">
                  {user.telegramUsername ? `@${user.telegramUsername}` : user.username}
                </span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                title="Выйти из Telegram"
                aria-label="Выйти из Telegram"
                className="p-2 rounded-lg bg-[#161920] hover:bg-rose-500/15 border border-white/[0.06] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="header-telegram-login"
              onClick={onOpenTelegramLogin}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-display font-bold text-xs transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer shadow-[0_0_20px_rgba(250,204,21,0.18)]"
            >
              <TelegramPaperPlaneIcon className="w-3.5 h-3.5" />
              <span>Войти</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact Mobile Nav */}
      <nav
        aria-label="Мобильная навигация"
        className="flex md:hidden items-center justify-around border-t border-white/[0.06] px-2 py-1.5 overflow-x-auto"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                isActive ? 'text-[#FACC15] bg-white/[0.06]' : 'text-slate-400'
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
