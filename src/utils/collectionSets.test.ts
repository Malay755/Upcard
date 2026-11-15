import test from 'node:test';
import assert from 'node:assert/strict';
import type { ItemCard } from '../types';
import { evaluateCollectionSetStatus, getCollectionBadgeMeta } from './collectionSets';

const SAMPLE_ITEMS: ItemCard[] = [
  { id: 'c1', name: 'Артемий Даун', rarity: 'rare', collection: 'Даун', price: 360, imageUrl: '/a.png', createdAt: 1 },
  { id: 'c2', name: 'Даун Тимур', rarity: 'epic', collection: 'Даун', price: 1500, imageUrl: '/b.png', createdAt: 2 },
  { id: 'c3', name: 'Кири-тян', rarity: 'epic', collection: 'Кирилл', price: 1850, imageUrl: '/c.png', createdAt: 3 },
];

test('evaluateCollectionSetStatus detects incomplete vs complete collections accurately', () => {
  const partial = evaluateCollectionSetStatus('Даун', SAMPLE_ITEMS, ['c1'], []);
  assert.equal(partial.totalCards, 2);
  assert.equal(partial.unlockedCards, 1);
  assert.equal(partial.isComplete, false);
  assert.equal(partial.isClaimed, false);

  const full = evaluateCollectionSetStatus('Даун', SAMPLE_ITEMS, ['c1', 'c2'], []);
  assert.equal(full.isComplete, true);
  assert.equal(full.isClaimed, false);
  assert.ok(full.rewardTc >= 150);
  assert.ok(full.rewardXp >= 120);
  assert.equal(full.badgeTitle, getCollectionBadgeMeta('Даун').badgeTitle);
});

test('evaluateCollectionSetStatus reflects claimed status and handles custom collections', () => {
  const claimed = evaluateCollectionSetStatus('Кирилл', SAMPLE_ITEMS, ['c3'], ['Кирилл']);
  assert.equal(claimed.isComplete, true);
  assert.equal(claimed.isClaimed, true);

  const empty = evaluateCollectionSetStatus('Неизвестная', SAMPLE_ITEMS, ['c1'], []);
  assert.equal(empty.totalCards, 0);
  assert.equal(empty.isComplete, false);
  assert.equal(empty.rewardTc, 0);
});
