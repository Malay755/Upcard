import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X } from 'lucide-react';
import type { BootstrapPayload, TelegramAuthConfig } from '../types';

export interface TelegramWidgetUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface TelegramAuthSuccessResult {
  payload: BootstrapPayload;
}

interface TelegramLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (result: TelegramAuthSuccessResult) => void;
}

type TelegramWidgetWindow = Window & {
  __onTelegramWidgetAuth?: (user: TelegramWidgetUser) => void;
};

export const TelegramPaperPlaneIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M21.93 3.44a1.25 1.25 0 0 0-1.3-.17L2.46 10.6a1.2 1.2 0 0 0 .06 2.24l4.53 1.54 1.72 5.31a1.05 1.05 0 0 0 1.75.41l2.63-2.55 4.74 3.5a1.24 1.24 0 0 0 1.94-.74l2.33-15.65a1.24 1.24 0 0 0-.23-1.22Zm-4.3 3.55-7.4 6.72a.75.75 0 0 0-.23.43l-.34 2.4-1.08-3.35 9.05-6.2Z" />
  </svg>
);

export const TelegramLoginModal: React.FC<TelegramLoginModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
}) => {
  const [config, setConfig] = useState<TelegramAuthConfig | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const handlersRef = useRef({ onAuthenticated, onClose });

  useEffect(() => {
    handlersRef.current = { onAuthenticated, onClose };
  }, [onAuthenticated, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setError('');
    setConfig(null);
    fetch('/api/auth/telegram/config')
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить настройки входа Telegram.');
        return (await response.json()) as TelegramAuthConfig;
      })
      .then((value) => { if (!cancelled) setConfig(value); })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Ошибка загрузки.');
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    const botUsername = config?.botUsername?.replace(/^@+/, '').trim();
    const container = widgetContainerRef.current;
    if (!isOpen || !config?.botConfigured || !botUsername || !container) return;

    const win = window as TelegramWidgetWindow;
    container.replaceChildren();
    win.__onTelegramWidgetAuth = async (telegramUser) => {
      setError('');
      setLoading(true);
      try {
        const response = await fetch('/api/auth/telegram/verify-widget', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(telegramUser),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Telegram не подтвердил вход.');
        handlersRef.current.onAuthenticated(result as TelegramAuthSuccessResult);
        handlersRef.current.onClose();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Ошибка входа через Telegram.');
      } finally {
        setLoading(false);
      }
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '10');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-onauth', 'window.__onTelegramWidgetAuth(user)');
    container.appendChild(script);

    return () => {
      container.replaceChildren();
      delete win.__onTelegramWidgetAuth;
    };
  }, [isOpen, config?.botConfigured, config?.botUsername]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="telegram-login-title"
    >
      <div className="w-full max-w-md bg-[#14161A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-modal-panel">
        <div className="flex items-center justify-between px-6 py-4 bg-[#19202B] border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#2AABEE] text-white flex items-center justify-center">
              <TelegramPaperPlaneIcon />
            </div>
            <div>
              <h2 id="telegram-login-title" className="text-base font-display font-bold text-white">
                Вход через Telegram
              </h2>
              <p className="text-[11px] text-slate-400">Подтверждение аккаунта у Telegram</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {config?.botConfigured && config.botUsername ? (
            <div className="flex flex-col items-center gap-3 py-5 px-4 rounded-xl bg-[#0D0F12] border border-white/[0.07]">
              <div ref={widgetContainerRef} />
              {loading && <span className="text-xs text-slate-400">Проверяем подпись Telegram…</span>}
            </div>
          ) : config ? (
            <div className="rounded-xl bg-[#0D0F12] border border-amber-400/20 p-4 text-sm text-slate-300">
              Вход пока не настроен. Серверу нужны `TELEGRAM_BOT_TOKEN` и имя бота; для домена сайта также включите его через `/setdomain` у @BotFather.
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">Загружаем официальный виджет…</div>
          )}

          {error && <p role="alert" className="text-xs text-rose-400 text-center">{error}</p>}

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-[#2AABEE]" />
            <span>Сайт проверяет криптографическую подпись Telegram на сервере.</span>
          </div>
          <p className="text-center text-[10px] text-slate-500">
            Для входа на боевом сайте привяжите его домен к боту командой `/setdomain` у @BotFather.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};
