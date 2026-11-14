import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RARITY_DISCOVERY_XP,
  getCardDiscoveryXp,
  getLevelProgress,
  getTotalCatalogXp,
  getXpRequiredForLevelUp,
} from './progression';

test('getCardDiscoveryXp awards increasing XP from rare to legendary', () => {
  const rareXp = getCardDiscoveryXp('rare');
  const superRareXp = getCardDiscoveryXp('super_rare');
  const epicXp = getCardDiscoveryXp('epic');
  const legendaryXp = getCardDiscoveryXp('legendary');

  assert.equal(rareXp, RARITY_DISCOVERY_XP.rare);
  assert.equal(superRareXp, RARITY_DISCOVERY_XP.super_rare);
  assert.equal(epicXp, RARITY_DISCOVERY_XP.epic);
  assert.equal(legendaryXp, RARITY_DISCOVERY_XP.legendary);
  assert.ok(rareXp < superRareXp);
  assert.ok(superRareXp < epicXp);
  assert.ok(epicXp < legendaryXp);
  assert.equal(getCardDiscoveryXp({ rarity: 'legendary' }), 600);
});

test('getLevelProgress starts at level 1 and levels up accurately at exact thresholds', () => {
  const lv1Start = getLevelProgress(0);
  assert.equal(lv1Start.level, 1);
  assert.equal(lv1Start.currentLevelXp, 0);
  assert.equal(lv1Start.nextLevelXp, 100);
  assert.equal(lv1Start.progressPercent, 0);
  assert.equal(lv1Start.title, 'Новичок');

  const halfway = getLevelProgress(50);
  assert.equal(halfway.level, 1);
  assert.equal(halfway.currentLevelXp, 50);
  assert.equal(halfway.progressPercent, 50);

  const exactLv2 = getLevelProgress(getXpRequiredForLevelUp(1));
  assert.equal(exactLv2.level, 2);
  assert.equal(exactLv2.currentLevelXp, 0);
  assert.equal(exactLv2.nextLevelXp, 175);

  const lv3 = getLevelProgress(100 + 175 + 25);
  assert.equal(lv3.level, 3);
  assert.equal(lv3.currentLevelXp, 25);
  assert.equal(lv3.nextLevelXp, 250);
  assert.equal(lv3.title, 'Искатель');
});

test('getLevelProgress clamps negative or non-finite XP safely', () => {
  assert.equal(getLevelProgress(-200).level, 1);
  assert.equal(getLevelProgress(-200).totalXp, 0);
  assert.equal(getLevelProgress(Number.NaN).level, 1);
});

test('getTotalCatalogXp sums discovery XP across all cards', () => {
  const sample = [
    { rarity: 'rare' as const },
    { rarity: 'super_rare' as const },
    { rarity: 'epic' as const },
    { rarity: 'legendary' as const },
  ];
  assert.equal(getTotalCatalogXp(sample), 50 + 120 + 250 + 600);
});
