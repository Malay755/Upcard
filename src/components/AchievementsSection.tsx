import React, { useMemo, useState } from 'react';
import { Award, CheckCircle2, Flame, Gift, Lock, Sparkles, Trophy } from 'lucide-react';
import type { AchievementCategory, AchievementId, ItemCard, UserProfile } from '../types';
import { evaluateAchievements, type AchievementProgress } from '../utils/achievements';
import { formatTC } from '../utils/economics';
import { soundFX } from '../utils/sound';

interface AchievementsSectionProps {
  user: UserProfile;
  items: ItemCard[];
  isAuthorized: boolean;
  onClaimAchievement?: (achievementId: AchievementId) => Promise<AchievementProgress>;
}

const CATEGORY_TABS: { id: 'all' | AchievementCategory; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'upgrades', label: 'Апгрейды' },
  { id: 'collection', label: 'Коллекция' },
  { id: 'cases_social', label: 'Кейсы и батлы' },
];

export const AchievementsSection: React.FC<AchievementsSectionProps> = ({
  user,
  items,
  isAuthorized,
  onClaimAchievement,
}) => {
  const [category, setCategory] = useState<'all' | AchievementCategory>('all');
  const [claimingId, setClaimingId] = useState<AchievementId | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const achievements = useMemo(() => evaluateAchievements(user, items), [user, items]);

  const unlockedCount = useMemo(
    () => achievements.filter((entry) => entry.unlocked).length,
    [achievements]
  );
  const claimableCount = useMemo(
    () => achievements.filter((entry) => entry.unlocked && !entry.claimed).length,
    [achievements]
  );

  const filtered = useMemo(
    () =>
      achievements.filter((entry) =>
        category === 'all' ? true : entry.category === category
      ),
    [achievements, category]
  );

  const handleClaim = async (entry: AchievementProgress) => {
    if (!isAuthorized || !onClaimAchievement || claimingId) return;
    setClaimingId(entry.id);
    setNotice(null);
    try {
      await onClaimAchievement(entry.id);
      soundFX.playCoin();
      setNotice({
        text: `Достижение «${entry.title}» засчитано! Начислено +${formatTC(entry.rewardTc)} TC и +${entry.rewardXp} XP.`,
        ok: true,
      });
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Не удалось забрать награду за достижение.',
        ok: false,
      });
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <section
      data-testid="achievements-section"
      className="bg-[#14161A] border border-white/[0.06] rounded-xl p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Trophy className="w-4 h-4 text-[#FACC15]" />
            <h2 className="text-sm font-display font-bold text-white">Достижения</h2>
            <span className="px-2 py-0.5 rounded bg-[#0D0F12] border border-white/[0.06] text-[11px] font-mono-num text-[#FACC15] font-bold">
              {unlockedCount} / {achievements.length}
            </span>
            {isAuthorized && claimableCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/35 text-[10px] font-semibold text-emerald-300">
                Доступно наград: {claimableCount}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Выполняйте особые испытания на арене, в кейсах, батлах и коллекционном дневнике за TC и XP
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Категории достижений">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                category === tab.id
                  ? 'bg-[#FACC15] text-[#0B0D10]'
                  : 'bg-[#0D0F12] text-slate-400 hover:text-white border border-white/[0.06]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-2.5 text-xs font-medium ${
            notice.ok
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-400/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((entry) => {
          const canClaim = isAuthorized && entry.unlocked && !entry.claimed && Boolean(onClaimAchievement);
          const isClaiming = claimingId === entry.id;

          return (
            <article
              key={entry.id}
              data-testid={`achievement-${entry.id}`}
              data-unlocked={entry.unlocked ? 'true' : 'false'}
              className={`relative rounded-xl border p-4 flex flex-col justify-between gap-3 transition-colors overflow-hidden ${
                entry.claimed
                  ? 'border-emerald-400/25 bg-gradient-to-b from-emerald-500/[0.08] via-[#13161C] to-[#0E1014]'
                  : entry.unlocked
                  ? 'border-[#FACC15]/45 bg-gradient-to-b from-[#FACC15]/[0.1] via-[#15181F] to-[#0E1014]'
                  : 'border-white/[0.06] bg-[#0D0F12]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0 inset-x-0 h-[2px] ${
                  entry.claimed
                    ? 'bg-emerald-400'
                    : entry.unlocked
                    ? 'bg-[#FACC15]'
                    : 'bg-white/10'
                }`}
              />

              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        entry.claimed
                          ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                          : entry.unlocked
                          ? 'bg-[#FACC15]/15 border-[#FACC15]/35 text-[#FACC15]'
                          : 'bg-white/[0.03] border-white/[0.07] text-slate-500'
                      }`}
                    >
                      {entry.claimed ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : entry.unlocked ? (
                        <Award className="w-4 h-4" />
                      ) : (
                        <Lock className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-display font-bold text-white truncate">
                        {entry.title}
                      </h3>
                      <div className="text-[10px] text-slate-500">{entry.categoryLabel}</div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 text-[10px] font-mono-num leading-tight">
                    <div className="font-bold text-[#FACC15]">+{formatTC(entry.rewardTc)} TC</div>
                    <div className="text-emerald-300 font-semibold flex items-center justify-end gap-0.5 mt-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>+{entry.rewardXp} XP</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{entry.description}</p>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-400">
                  <span>Прогресс</span>
                  <span className={entry.unlocked ? 'text-emerald-300 font-bold' : 'text-slate-300'}>
                    {entry.progress} / {entry.maxProgress}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      entry.claimed
                        ? 'bg-emerald-400'
                        : entry.unlocked
                        ? 'bg-[#FACC15]'
                        : 'bg-amber-400/50'
                    }`}
                    style={{ width: `${entry.progressPercent}%` }}
                  />
                </div>

                {canClaim ? (
                  <button
                    type="button"
                    disabled={isClaiming}
                    data-testid={`claim-achievement-${entry.id}`}
                    onClick={() => handleClaim(entry)}
                    className="w-full mt-1 py-1.5 px-3 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-[#0B0D10] text-xs font-display font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>{isClaiming ? 'Забираем...' : 'Забрать награду'}</span>
                  </button>
                ) : entry.claimed ? (
                  <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-center gap-1 pt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Награда получена</span>
                  </div>
                ) : entry.unlocked ? (
                  <div className="text-[11px] font-semibold text-[#FACC15] flex items-center justify-center gap-1 pt-0.5">
                    <Flame className="w-3.5 h-3.5" />
                    <span>Открыто</span>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
