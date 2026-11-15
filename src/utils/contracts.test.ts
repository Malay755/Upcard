import test from 'node:test';
import assert from 'node:assert/strict';
import type { ItemCard } from '../types';
import {
  CONTRACT_REQUIRED_COUNT,
  buildContractPreview,
  calculateContractOutcomes,
  getNextContractRarity,
  pickContractOutcome,
} from './contracts';

const CATALOG: ItemCard[] = [
  { id: 'r1', name: 'Редкая 1', rarity: 'rare', price: 360, imageUrl: '/r1.png', createdAt: 1 },
  { id: 's1', name: 'Сверхредкая 1', rarity: 'super_rare', price: 980, imageUrl: '/s1.png', createdAt: 2 },
  { id: 'e1', name: 'Эпическая 1', rarity: 'epic', price: 1500, imageUrl: '/e1.png', createdAt: 3 },
  { id: 'e2', name: 'Эпическая 2', rarity: 'epic', price: 2900, imageUrl: '/e2.png', createdAt: 4 },
  { id: 'l1', name: 'Легендарная 1', rarity: 'legendary', price: 5400, imageUrl: '/l1.png', createdAt: 5 },
  { id: 'l2', name: 'Легендарная 2', rarity: 'legendary', price: 14500, imageUrl: '/l2.png', createdAt: 6 },
];

test('getNextContractRarity steps up one rarity tier and stops at legendary', () => {
  assert.equal(getNextContractRarity('common'), 'rare');
  assert.equal(getNextContractRarity('rare'), 'super_rare');
  assert.equal(getNextContractRarity('super_rare'), 'epic');
  assert.equal(getNextContractRarity('epic'), 'legendary');
  assert.equal(getNextContractRarity('legendary'), null);
});

test('calculateContractOutcomes normalizes probabilities to 100% and favors cheaper items within tier', () => {
  const outcomes = calculateContractOutcomes('legendary', CATALOG);
  assert.equal(outcomes.length, 2);
  const sum = outcomes.reduce((acc, entry) => acc + entry.probability, 0);
  assert.ok(Math.abs(sum - 100) < 0.01);
  assert.ok(outcomes[0].probability > outcomes[1].probability);

  assert.equal(pickContractOutcome(outcomes, 0).id, 'l1');
  assert.equal(pickContractOutcome(outcomes, 0.999999).id, 'l2');
});

test('buildContractPreview enforces 7 cards of identical non-legendary rarity', () => {
  const sevenRare = Array.from({ length: CONTRACT_REQUIRED_COUNT }, () => CATALOG[0]);
  const valid = buildContractPreview(sevenRare, CATALOG);
  assert.equal(valid.eligible, true);
  assert.equal(valid.targetRarity, 'super_rare');
  assert.equal(valid.targetPool.length, 1);

  const mixed = [...sevenRare.slice(0, 6), CATALOG[1]];
  const mixedPreview = buildContractPreview(mixed, CATALOG);
  assert.equal(mixedPreview.eligible, false);

  const partial = sevenRare.slice(0, 5);
  const partialPreview = buildContractPreview(partial, CATALOG);
  assert.equal(partialPreview.eligible, false);
  assert.equal(partialPreview.targetRarity, 'super_rare');

  const sevenLegendary = Array.from({ length: CONTRACT_REQUIRED_COUNT }, () => CATALOG[4]);
  const legPreview = buildContractPreview(sevenLegendary, CATALOG);
  assert.equal(legPreview.eligible, false);
});
