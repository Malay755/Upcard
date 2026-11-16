import type { MinigameEnergySlot, MinigameId, MinigameStatusMap, UserProfile } from '../types';

export const DAILY_MINIGAME_MAX_CHARGES = 3;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getMskDayKey(now = Date.now()): string {
  return new Date(now + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

export function getNextMskMidnightMs(now = Date.now()): number {
  const shifted = now + MSK_OFFSET_MS;
  const nextShiftedMidnight = (Math.floor(shifted / DAY_MS) + 1) * DAY_MS;
  return nextShiftedMidnight - MSK_OFFSET_MS;
}

export function createDefaultMinigameEnergy(now = Date.now()): NonNullable<UserProfile['minigameEnergy']> {
  const dayKey = getMskDayKey(now);
  return {
    harvest: { charges: DAILY_MINIGAME_MAX_CHARGES, lastRechargeAt: now, dayKey, bestScore: 0, playsCount: 0 },
    mines: { charges: DAILY_MINIGAME_MAX_CHARGES, lastRechargeAt: now, dayKey, bestScore: 0, playsCount: 0 },
    race: { charges: DAILY_MINIGAME_MAX_CHARGES, lastRechargeAt: now, dayKey, bestScore: 0, playsCount: 0 },
  };
}

export function syncDailyMinigameEnergy(
  user: Pick<UserProfile, 'minigameEnergy'>,
  now = Date.now()
): NonNullable<UserProfile['minigameEnergy']> {
  const currentDay = getMskDayKey(now);
  if (!user.minigameEnergy) {
    user.minigameEnergy = createDefaultMinigameEnergy(now);
  }
  const games: MinigameId[] = ['harvest', 'mines', 'race'];
  for (const game of games) {
    const slot = user.minigameEnergy[game] ?? {
      charges: DAILY_MINIGAME_MAX_CHARGES,
      lastRechargeAt: now,
      dayKey: currentDay,
      bestScore: 0,
      playsCount: 0,
    };

    slot.bestScore = Math.max(0, Math.floor(Number(slot.bestScore) || 0));
    slot.playsCount = Math.max(0, Math.floor(Number(slot.playsCount) || 0));

    // Legacy records before dayKey rolled out fall back cleanly to their lastRechargeAt MSK calendar date
    const resolvedSlotDay =
      typeof slot.dayKey === 'string' && slot.dayKey.length === 10
        ? slot.dayKey
        : getMskDayKey(Number.isFinite(slot.lastRechargeAt) && slot.lastRechargeAt > 0 ? slot.lastRechargeAt : now);

    if (resolvedSlotDay !== currentDay) {
      slot.charges = DAILY_MINIGAME_MAX_CHARGES;
      slot.dayKey = currentDay;
      slot.lastRechargeAt = now;
    } else {
      slot.dayKey = currentDay;
      slot.charges = Math.max(0, Math.min(DAILY_MINIGAME_MAX_CHARGES, Math.floor(Number(slot.charges) || 0)));
      slot.lastRechargeAt = Number.isFinite(slot.lastRechargeAt) && slot.lastRechargeAt > 0 ? slot.lastRechargeAt : now;
    }

    user.minigameEnergy[game] = slot;
  }
  return user.minigameEnergy;
}

export function buildMinigameStatusMap(
  user?: Pick<UserProfile, 'minigameEnergy'>,
  now = Date.now()
): MinigameStatusMap {
  const games: MinigameId[] = ['harvest', 'mines', 'race'];
  const energy = user ? syncDailyMinigameEnergy(user, now) : createDefaultMinigameEnergy(now);
  const nextResetAt = getNextMskMidnightMs(now);
  const result = {} as MinigameStatusMap;
  for (const game of games) {
    const slot = energy[game];
    result[game] = {
      charges: slot.charges,
      maxCharges: DAILY_MINIGAME_MAX_CHARGES,
      nextRechargeAt: slot.charges < DAILY_MINIGAME_MAX_CHARGES ? nextResetAt : null,
      bestScore: slot.bestScore,
      playsCount: slot.playsCount,
    } satisfies MinigameEnergySlot;
  }
  return result;
}
