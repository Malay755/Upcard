import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateUpgradeOdds,
  resolveUpgradeRoll,
  calculateCaseDropProbabilities,
  pickWeightedCaseDrop,
  calculateDepositWithPromo,
  calculateDailyReward,
} from './economics';
import type { ItemCard } from '../types';

test('calculateUpgradeOdds keeps the 95% RTP formula at every chance', () => {
  const even = calculateUpgradeOdds(500, 1000, 'under');
  assert.equal(even.winChance, 47.5);
  assert.equal(even.multiplier, 2);
  assert.equal(even.minRoll, 0);
  assert.equal(even.maxRoll, 47.5);

  const over = calculateUpgradeOdds(500, 1000, 'over');
  assert.equal(over.winChance, 47.5);
  assert.equal(over.minRoll, 52.5);
  assert.equal(over.maxRoll, 100);

  // High chances are not capped because a cap would alter RTP.
  const high = calculateUpgradeOdds(950, 1000, 'under');
  assert.equal(high.winChance, 90.25);

  // Long-shot chances are not raised to 1%.
  const longshot = calculateUpgradeOdds(10, 50000, 'under');
  assert.equal(longshot.winChance, 0.019);

  // Invalid when stake >= target
  const invalid = calculateUpgradeOdds(1000, 900, 'under');
  assert.equal(invalid.winChance, 0);
});

test('resolveUpgradeRoll accurately resolves under and over modes', () => {
  assert.equal(resolveUpgradeRoll(25, 47.5, 'under'), true);
  assert.equal(resolveUpgradeRoll(47.5, 47.5, 'under'), false);
  assert.equal(resolveUpgradeRoll(60, 47.5, 'over'), true);
  assert.equal(resolveUpgradeRoll(52.5, 47.5, 'over'), true);
  assert.equal(resolveUpgradeRoll(52.49, 47.5, 'over'), false);
});

test('calculateCaseDropProbabilities normalizes probabilities to ~100% and respects rarity weights', () => {
  const items: ItemCard[] = [
    { id: 'c1', name: 'Common', rarity: 'common', price: 100, imageUrl: '', createdAt: 1 },
    { id: 'r1', name: 'Rare', rarity: 'rare', price: 300, imageUrl: '', createdAt: 1 },
    { id: 'e1', name: 'Epic', rarity: 'epic', price: 1000, imageUrl: '', createdAt: 1 },
    { id: 'l1', name: 'Legend', rarity: 'legendary', price: 4000, imageUrl: '', createdAt: 1 },
  ];

  const probs = calculateCaseDropProbabilities(
    { rarityWeights: { common: 60, rare: 25, epic: 12, legendary: 3 } },
    items
  );

  const sum = probs.reduce((acc, p) => acc + p.probability, 0);
  assert.ok(Math.abs(sum - 100) < 0.05);
  assert.equal(probs[0].item.id, 'c1');
  assert.equal(probs[0].probability, 60);
  assert.equal(probs[3].item.id, 'l1');
  assert.equal(probs[3].probability, 3);

  // Deterministic picking
  assert.equal(pickWeightedCaseDrop(probs, 0.05).id, 'c1');
  assert.equal(pickWeightedCaseDrop(probs, 0.99).id, 'l1');
});

test('calculateDepositWithPromo applies valid promo codes and ignores unknown ones', () => {
  const withPromo = calculateDepositWithPromo(1000, 'drip2026');
  assert.equal(withPromo.bonusAmount, 250);
  assert.equal(withPromo.totalCredited, 1250);
  assert.equal(withPromo.appliedPromo, 'DRIP2026');

  const noPromo = calculateDepositWithPromo(1000, 'INVALID');
  assert.equal(noPromo.bonusAmount, 0);
  assert.equal(noPromo.totalCredited, 1000);
  assert.equal(noPromo.appliedPromo, null);
});

test('calculateDailyReward returns 7-day progressive schedule', () => {
  assert.equal(calculateDailyReward(1), 150);
  assert.equal(calculateDailyReward(7), 1200);
  assert.equal(calculateDailyReward(8), 150);
});
