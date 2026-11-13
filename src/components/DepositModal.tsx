import React, { useState } from 'react';
import { CheckCircle2, CreditCard, QrCode, ShieldCheck, Wallet, X } from 'lucide-react';
import { calculateDepositWithPromo, formatTC, PROMO_CODES } from '../utils/economics';
import { soundFX } from '../utils/sound';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeposit: (amount: number, method: string, promoCode: string) => Promise<{
    txId: string;
    method: string;
    baseAmount: number;
    bonusAmount: number;
    totalCredited: number;
    appliedPromo: string | null;
  }>;
}

const PAYMENT_METHODS = [
  { id: 'tbank', name: 'Т-Банк Дрип-Пэй', subtitle: 'СБП QR · 0% комиссия', icon: QrCode },
  { id: 'ton', name: 'Крипто-Кошелек', subtitle: 'TON / MemeCoin · Мгновенно', icon: Wallet },
  { id: 'skinpay', name: 'Скин-Пэй Фантики', subtitle: 'Мгновенный обмен карт', icon: ShieldCheck },
  { id: 'baton', name: 'Карта «Золотой Батон»', subtitle: 'Элитный шуточный банк', icon: CreditCard },
];

const PRESET_AMOUNTS = [500, 1500, 5000, 15000];

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onDeposit }) => {
  const [selectedMethod, setSelectedMethod] = useState(PAYMENT_METHODS[0].id);
  const [amount, setAmount] = useState<number>(1500);
  const [promoCode, setPromoCode] = useState('');
  const [status, setStatus] = useState<'form' | 'processing' | 'receipt'>('form');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{
    txId: string;
    method: string;
    baseAmount: number;
    bonusAmount: number;
    totalCredited: number;
    appliedPromo: string | null;
  } | null>(null);

  if (!isOpen) return null;

  const preview = calculateDepositWithPromo(amount, promoCode);
  const activeMethodObj = PAYMENT_METHODS.find((m) => m.id === selectedMethod) ?? PAYMENT_METHODS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (amount < 50 || amount > 250000) {
      setError('Укажите сумму от 50 до 250 000 Т-коин.');
      return;
    }

    setStatus('processing');
    try {
      await new Promise((r) => setTimeout(r, 900));
      const res = await onDeposit(amount, activeMethodObj.name, promoCode);
      soundFX.playCoin();
      setReceipt(res);
      setStatus('receipt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка обработки платежа.');
      setStatus('form');
    }
  };

  const resetAndClose = () => {
    setStatus('form');
    setReceipt(null);
    setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-modal-title"
    >
      <div className="w-full max-w-xl bg-[#14161A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div>
            <h2 id="deposit-modal-title" className="text-lg font-display font-bold text-white">
              Пополнение баланса Т-коин
            </h2>
            <p className="text-xs text-slate-400">
              Игровая валюта (демо-платежи без списания реальных денег)
            </p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Закрыть окно пополнения"
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {status === 'form' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Payment Method Grid */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Платежная система
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PAYMENT_METHODS.map((method) => {
                  const Icon = method.icon;
                  const active = selectedMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedMethod(method.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-amber-500/10 border-amber-500 text-white'
                          : 'bg-[#191E2C] border-white/[0.07] text-slate-300 hover:border-white/20'
                      }`}
                    >
                      <div
                        className={`p-2 rounded-lg ${
                          active ? 'bg-amber-500 text-slate-950' : 'bg-white/[0.06] text-slate-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{method.name}</div>
                        <div className="text-xs text-slate-400 truncate">{method.subtitle}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount Presets & Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="deposit-amount" className="text-xs font-medium text-slate-300">
                  Сумма пополнения (Т-коин)
                </label>
                <div className="flex items-center gap-1.5">
                  {PRESET_AMOUNTS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(preset)}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono-num font-semibold transition-colors cursor-pointer ${
                        amount === preset
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-[#191E2C] text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      +{formatTC(preset)}
                    </button>
                  ))}
                </div>
              </div>
              <input
                id="deposit-amount"
                type="number"
                min={50}
                max={250000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0D0F12] border border-white/10 text-white font-mono-num text-base focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Promo Code */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="deposit-promo" className="text-xs font-medium text-slate-300">
                  Промокод (необязательно)
                </label>
                <span className="text-[11px] text-slate-400">
                  Попробуйте: {Object.keys(PROMO_CODES).join(' / ')}
                </span>
              </div>
              <input
                id="deposit-promo"
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Например, DRIP2026"
                className="w-full px-4 py-2.5 rounded-xl bg-[#0D0F12] border border-white/10 text-white uppercase font-mono-num text-sm focus:outline-none focus:border-amber-500"
              />
              {preview.appliedPromo && (
                <p className="mt-1.5 text-xs text-emerald-400">
                  Промокод {preview.appliedPromo} применен: +{formatTC(preview.bonusAmount)} Т-коин бонусом
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Total Summary & Submit */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
              <div>
                <div className="text-xs text-slate-400">К зачислению</div>
                <div className="text-xl font-mono-num font-bold text-[#FACC15]">
                  {formatTC(preview.totalCredited)} TC
                </div>
              </div>
              <button
                type="submit"
                className="px-6 py-3 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] font-semibold text-sm transition-colors cursor-pointer"
              >
                Оплатить {formatTC(amount)} фантиков
              </button>
            </div>
          </form>
        )}

        {status === 'processing' && (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin" />
            <div className="text-base font-semibold text-white">
              Подтверждение через {activeMethodObj.name}...
            </div>
            <p className="text-xs text-slate-400">
              Проверяем шуточную транзакцию в блокчейне Т-коина
            </p>
          </div>
        )}

        {status === 'receipt' && receipt && (
          <div className="p-6 space-y-5 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-display font-bold text-white">
                +{formatTC(receipt.totalCredited)} Т-коин зачислено
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Чек {receipt.txId} · {receipt.method}
              </p>
            </div>
            <div className="bg-[#0D0F12] border border-white/[0.08] rounded-xl p-4 text-sm space-y-2">
              <div className="flex justify-between text-slate-300">
                <span>Базовая сумма</span>
                <span className="font-mono-num">{formatTC(receipt.baseAmount)} TC</span>
              </div>
              <div className="flex justify-between text-emerald-400">
                <span>Бонус по промокоду</span>
                <span className="font-mono-num">+{formatTC(receipt.bonusAmount)} TC</span>
              </div>
            </div>
            <button
              type="button"
              onClick={resetAndClose}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
            >
              Вернуться к игре
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
