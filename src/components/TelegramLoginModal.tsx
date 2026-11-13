import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Check, Copy, ExternalLink, RefreshCw, ShieldCheck, X } from 'lucide-react';
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
  sessionToken: string;
}

interface TelegramLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (result: TelegramAuthSuccessResult) => void;
}

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
  const [botSession, setBotSession] = useState<{
    sessionId: string;
    code: string;
    deepLink: string | null;
    expiresAt: number;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const [tgHandle, setTgHandle] = useState('@playerone_tg');
  const [firstName, setFirstName] = useState('PlayerOne');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const widgetContainerRef = useRef<HTMLDivElement | null>(null);

  const loadConfigAndSession = useCallback(async () => {
    try {
      const cfgRes = await fetch('/api/auth/telegram/config');
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as TelegramAuthConfig;
        setConfig(cfg);
      }
      const sessRes = await fetch('/api/auth/telegram/init-session', { method: 'POST' });
      if (sessRes.ok) {
        const sess = (await sessRes.json()) as {
          sessionId: string;
          code: string;
          deepLink: string | null;
          expiresAt: number;
        };
        setBotSession(sess);
      }
    } catch {
      // Keep UI responsive even if network hiccups
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    loadConfigAndSession();
  }, [isOpen, loadConfigAndSession]);

  // Mount Official Telegram Login Widget when botUsername is configured
  useEffect(() => {
    const botUsername =
      config?.botUsername ||
      ((import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? '').replace(/^@+/, '');
    if (!isOpen || !botUsername || !widgetContainerRef.current) return;

    const container = widgetContainerRef.current;
    container.innerHTML = '';

    const win = window as unknown as Record<string, unknown>;
    win.__onTelegramWidgetAuth = async (tgUser: TelegramWidgetUser) => {
      setError('');
      setSubmitting(true);
      try {
        const res = await fetch('/api/auth/telegram/verify-widget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tgUser),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка проверки подписи Telegram.');
        onAuthenticated(data as TelegramAuthSuccessResult);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка входа через Telegram.');
      } finally {
        setSubmitting(false);
      }
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '10');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', '__onTelegramWidgetAuth(user)');
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
      delete win.__onTelegramWidgetAuth;
    };
  }, [isOpen, config?.botUsername, onAuthenticated, onClose]);

  // Poll pending Telegram Bot Deep-Link authorization session
  useEffect(() => {
    if (!isOpen || !botSession?.sessionId) return;

    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(
          `/api/auth/telegram/session/${encodeURIComponent(botSession.sessionId)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: 'pending' | 'verified' | 'expired';
          payload?: BootstrapPayload;
          sessionToken?: string;
        };
        if (data.status === 'verified' && data.payload && data.sessionToken) {
          window.clearInterval(interval);
          onAuthenticated({ payload: data.payload, sessionToken: data.sessionToken });
          onClose();
        } else if (data.status === 'expired') {
          loadConfigAndSession();
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [isOpen, botSession?.sessionId, onAuthenticated, onClose, loadConfigAndSession]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handlePreviewAuth = async (username: string, name?: string) => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.replace(/^@+/, '').trim(),
          firstName: name?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка авторизации Telegram.');
      onAuthenticated(data as TelegramAuthSuccessResult);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка авторизации Telegram.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSimulateBotWebhook = async () => {
    if (!botSession) return;
    setError('');
    setSubmitting(true);
    try {
      const cleanHandle = tgHandle.replace(/^@+/, '').trim() || 'playerone_tg';
      const cleanName = firstName.trim() || cleanHandle;
      // Trigger the actual Telegram Bot webhook endpoint just as Telegram's servers do when /start auth_<token> is sent
      const res = await fetch('/api/telegram/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            text: `/start auth_${botSession.sessionId}`,
            chat: { id: 700100201 },
            from: {
              id: cleanHandle.toLowerCase() === 'playerone_tg' ? 700100201 : 700100999,
              username: cleanHandle,
              first_name: cleanName,
            },
          },
        }),
      });
      if (!res.ok) throw new Error('Не удалось подтвердить сессию через вебхук бота.');
      // Fetch the verified session immediately instead of waiting for next poll tick
      const pollRes = await fetch(
        `/api/auth/telegram/session/${encodeURIComponent(botSession.sessionId)}`
      );
      const pollData = await pollRes.json();
      if (pollData.status === 'verified' && pollData.payload && pollData.sessionToken) {
        onAuthenticated({ payload: pollData.payload, sessionToken: pollData.sessionToken });
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа через бота.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCommand = async () => {
    if (!botSession) return;
    try {
      await navigator.clipboard.writeText(`/auth ${botSession.code}`);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const effectiveBotUsername =
    config?.botUsername ||
    ((import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? '').replace(/^@+/, '');

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Авторизация через Telegram"
    >
      <div className="w-full max-w-md bg-[#14161A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-banner-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#19202B] border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#2AABEE] text-white flex items-center justify-center shadow-[0_0_16px_rgba(42,171,238,0.35)]">
              <TelegramPaperPlaneIcon className="w-4 h-4 -translate-x-0.5" />
            </div>
            <div>
              <h2 className="text-base font-display font-bold text-white">Telegram Auth</h2>
              <p className="text-[11px] text-slate-400">
                {config?.botConfigured
                  ? `Бот @${effectiveBotUsername || 'configured'} · HMAC-SHA256`
                  : 'Вход через Telegram-бота и единый ID'}
              </p>
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
          {/* 1. Official Telegram Login Widget (active when botUsername is set) */}
          {effectiveBotUsername && (
            <div className="flex flex-col items-center justify-center py-3 px-4 rounded-xl bg-[#0D0F12] border border-white/[0.07] space-y-2">
              <div className="text-[11px] text-slate-400">Официальный виджет Telegram</div>
              <div ref={widgetContainerRef} />
            </div>
          )}

          {/* 2. Telegram Bot Deep-Link Auth Block */}
          <div className="rounded-xl bg-[#0D0F12] border border-[#2AABEE]/25 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-display font-bold text-white">
                <Bot className="w-4 h-4 text-[#2AABEE]" />
                <span>Авторизация через Telegram-бота</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono-num text-[#2AABEE]">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Ожидание
              </span>
            </div>

            {botSession?.deepLink ? (
              <a
                href={botSession.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-display font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-[0_6px_18px_rgba(42,171,238,0.28)]"
              >
                <TelegramPaperPlaneIcon className="w-3.5 h-3.5" />
                <span>Открыть @{effectiveBotUsername} и войти</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            ) : (
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Для привязки живого бота добавьте <code className="text-slate-200">TELEGRAM_BOT_TOKEN</code> в настройки окружения — появится прямая ссылка <code className="text-[#2AABEE]">t.me/bot?start=auth_...</code> и проверка подписи HMAC-SHA256.
              </p>
            )}

            {botSession && (
              <div className="flex items-center justify-between gap-2 bg-[#14161A] border border-white/[0.06] rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-500">Код команды для бота:</div>
                  <div className="text-xs font-mono-num font-bold text-[#FACC15] truncate">
                    /auth {botSession.code}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCommand}
                  className="px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-medium text-slate-200 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Копировать</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 3. Preview Quick Login (only when server TELEGRAM_BOT_TOKEN is not yet configured) */}
          {!config?.botConfigured && (
            <div className="space-y-3 pt-1">
              <div className="text-xs font-medium text-slate-400">
                Быстрый вход в тестовый Telegram-аккаунт:
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handlePreviewAuth('playerone_tg', 'PlayerOne')}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#0D0F12] hover:bg-[#19202B] border border-white/10 hover:border-[#2AABEE]/60 text-left transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-[#2AABEE] text-white font-bold text-xs flex items-center justify-center shrink-0">
                    PO
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">PlayerOne</div>
                    <div className="text-[10px] text-[#2AABEE] truncate">@playerone_tg</div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handlePreviewAuth('drip_master', 'DripMaster')}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#0D0F12] hover:bg-[#19202B] border border-white/10 hover:border-[#2AABEE]/60 text-left transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    DM
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">DripMaster</div>
                    <div className="text-[10px] text-[#2AABEE] truncate">@drip_master</div>
                  </div>
                </button>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="tg-handle-input" className="block text-[11px] text-slate-400 mb-1">
                      Telegram @username
                    </label>
                    <input
                      id="tg-handle-input"
                      type="text"
                      value={tgHandle}
                      onChange={(e) => setTgHandle(e.target.value)}
                      placeholder="@username"
                      className="w-full px-3 py-2 rounded-lg bg-[#0D0F12] border border-white/10 text-xs text-white focus:outline-none focus:border-[#2AABEE]"
                    />
                  </div>
                  <div>
                    <label htmlFor="tg-name-input" className="block text-[11px] text-slate-400 mb-1">
                      Имя
                    </label>
                    <input
                      id="tg-name-input"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Ваше имя"
                      className="w-full px-3 py-2 rounded-lg bg-[#0D0F12] border border-white/10 text-xs text-white focus:outline-none focus:border-[#2AABEE]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handlePreviewAuth(tgHandle, firstName)}
                    className="py-2.5 px-3 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] disabled:opacity-50 text-[#0B0D10] font-display font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <TelegramPaperPlaneIcon className="w-3.5 h-3.5" />
                    <span>Войти</span>
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !botSession}
                    onClick={handleSimulateBotWebhook}
                    className="py-2.5 px-3 rounded-xl bg-[#2AABEE]/15 hover:bg-[#2AABEE]/25 border border-[#2AABEE]/40 disabled:opacity-50 text-[#2AABEE] font-display font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>Тест бота</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-400 text-center">{error}</p>}

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#2AABEE]" />
            <span>
              Webhook для бота: <code className="text-slate-300">/api/telegram/webhook</code>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
