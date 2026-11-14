import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterItemsByCollection,
  getAvailableCollections,
  inferCardCollection,
  resolveCardCollection,
} from './collections';

test('inferCardCollection assigns thematic "Даун" collection before member names', () => {
  assert.equal(inferCardCollection('Артемий Даун'), 'Даун');
  assert.equal(inferCardCollection('Даун Тимур'), 'Даун');
});

test('inferCardCollection resolves all member-based and squad collections accurately', () => {
  assert.equal(inferCardCollection('Хастлер Артемий'), 'Артемий');
  assert.equal(inferCardCollection('Бухой Артемий'), 'Артемий');
  assert.equal(inferCardCollection('Сумашедший Артемий'), 'Артемий');

  assert.equal(inferCardCollection('Горбатый Тимур'), 'Тимур');
  assert.equal(inferCardCollection('Фотограф Тимур'), 'Тимур');
  assert.equal(inferCardCollection('Тимур на Волге'), 'Тимур');

  assert.equal(inferCardCollection('Майкл Пиздюк'), 'Майкл');
  assert.equal(inferCardCollection('Шпион Майкл'), 'Майкл');
  assert.equal(inferCardCollection('Жопа Майкла'), 'Майкл');

  assert.equal(inferCardCollection('Усатый Ваня'), 'Ваня');
  assert.equal(inferCardCollection('Ваня Дрипчик'), 'Ваня');

  assert.equal(inferCardCollection('Кири-тян'), 'Кирилл');
  assert.equal(inferCardCollection('Кирилл Легенда'), 'Кирилл');

  assert.equal(inferCardCollection('4Б'), 'Сквад');
  assert.equal(inferCardCollection('Ебланы'), 'Сквад');
  assert.equal(inferCardCollection('TENET T4'), 'Сквад');
});

test('resolveCardCollection prefers explicit stored collection and falls back to inference', () => {
  assert.equal(resolveCardCollection({ name: 'TENET T4', collection: 'Автопарк' }), 'Автопарк');
  assert.equal(resolveCardCollection({ name: 'Усатый Ваня' }), 'Ваня');
  assert.equal(resolveCardCollection({ name: 'Даун Тимур', collection: '   ' }), 'Даун');
});

test('getAvailableCollections returns canonical ordering plus custom collections', () => {
  const sample = [
    { name: 'TENET T4' },
    { name: 'Усатый Ваня' },
    { name: 'Артемий Даун' },
    { name: 'Спец Карта', collection: 'Бонус' },
  ];
  assert.deepEqual(getAvailableCollections(sample), ['Даун', 'Ваня', 'Сквад', 'Бонус']);
});

test('filterItemsByCollection filters correctly and supports "all"', () => {
  const sample = [
    { id: '1', name: 'Артемий Даун' },
    { id: '2', name: 'Даун Тимур' },
    { id: '3', name: 'Ваня Дрипчик' },
  ];
  assert.equal(filterItemsByCollection(sample, 'all').length, 3);
  assert.deepEqual(
    filterItemsByCollection(sample, 'Даун').map((x) => x.id),
    ['1', '2']
  );
  assert.deepEqual(
    filterItemsByCollection(sample, 'Ваня').map((x) => x.id),
    ['3']
  );
});
