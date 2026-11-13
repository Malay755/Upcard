import React, { useState } from 'react';
import { Coins, X } from 'lucide-react';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCredit: (amount: number) => Promise<number>;
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onCredit }) => {
  const [amount, setAmount] = useState('1500');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const credited = await onCredit(Number(amount));
      setMessage(`На аккаунт начислено ${credited.toLocaleString('ru-RU')} TC.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось начислить баланс.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="deposit-modal-title">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-[#14161A] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="deposit-modal-title" className="text-lg font-bold text-white">Начислить баланс</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-xs leading-relaxed text-amber-100">
          Временное игровое начисление TC. Реальная оплата не производится.
        </div>
        <label className="block space-y-2 text-sm text-slate-300">
          <span>Сколько начислить? (от 50 до 250 000 TC)</span>
          <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0D0F12] px-3 focus-within:border-amber-300/50">
            <Coins className="h-4 w-4 text-amber-300" />
            <input type="number" min={50} max={250000} step={1} required value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full bg-transparent py-3 font-mono-num text-white outline-none" />
            <span className="text-xs text-slate-500">TC</span>
          </span>
        </label>
        {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300 disabled:opacity-50">
          {busy ? 'Начисляем…' : 'Начислить на аккаунт'}
        </button>
      </form>
    </div>
  );
};
