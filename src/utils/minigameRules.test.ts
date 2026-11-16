import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile } from '../types';
import {
  buildMinigameStatusMap,
  DAILY_MINIGAME_MAX_CHARGES,
  getMskDayKey,
  getNextMskMidnightMs,
  syncDailyMinigameEnergy,
} from './minigameRules';

test('daily minigame energy stays exhausted within the same MSK calendar day (no 3-minute recharge)', () => {
  const dayStart = Date.UTC(2026, 10, 16, 10, 0, 0); // 13:00 MSK
  const user: Pick<UserProfile, 'minigameEnergy'> = {};
  const energy = syncDailyMinigameEnergy(user, dayStart);
  assert.equal(energy.harvest.charges, DAILY_MINIGAME_MAX_CHARGES);

  // Spend all 3 attempts
  energy.harvest.charges = 0;
  energy.harvest.lastRechargeAt = dayStart;

  // 2 hours later on the same MSK day -> must still be 0 charges!
  const twoHoursLater = dayStart + 2 * 60 * 60 * 1000;
  syncDailyMinigameEnergy(user, twoHoursLater);
  assert.equal(energy.harvest.charges, 0);

  const status = buildMinigameStatusMap(user, twoHoursLater);
  assert.equal(status.harvest.charges, 0);
  assert.equal(status.harvest.maxCharges, 3);
  assert.equal(status.harvest.nextRechargeAt, getNextMskMidnightMs(twoHoursLater));
  assert.equal(status.mines.charges, 3);
  assert.equal(status.mines.nextRechargeAt, null);
});

test('daily minigame energy resets cleanly to 3/3 right after 00:00 MSK midnight', () => {
  const beforeMidnight = Date.UTC(2026, 10, 16, 20, 58, 0); // 23:58 MSK Nov 16
  const afterMidnight = Date.UTC(2026, 10, 16, 21, 1, 0);   // 00:01 MSK Nov 17
  assert.notEqual(getMskDayKey(beforeMidnight), getMskDayKey(afterMidnight));

  const user: Pick<UserProfile, 'minigameEnergy'> = {};
  const energy = syncDailyMinigameEnergy(user, beforeMidnight);
  energy.race.charges = 0;
  energy.race.bestScore = 420;
  energy.race.playsCount = 3;

  syncDailyMinigameEnergy(user, afterMidnight);
  assert.equal(energy.race.charges, 3);
  assert.equal(energy.race.bestScore, 420);
  assert.equal(energy.race.playsCount, 3);
  assert.equal(energy.race.dayKey, getMskDayKey(afterMidnight));
});
