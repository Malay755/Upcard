import test from 'node:test';
import assert from 'node:assert/strict';
import type { DurakCard, DurakRank, DurakSuit } from '../types';
import { buildDurak32Deck, DURAK_EXCLUDED_ITEM_IDS } from './durakDeck';
import {
  applyDurakAction,
  canBeatCard,
  canTransferNow,
  finalizeDurakGame,
  forfeitDurakPlayer,
  projectDurakRoomForUser,
  resolveDurakTimeout,
  startDurakGame,
  type DurakRoomState,
} from './durakEngine';

function card(suit: DurakSuit, rank: DurakRank): DurakCard {
  return {
    id: `${suit}_${rank}`,
    itemId: `item_${suit}_${rank}`,
    name: `${suit}_${rank}`,
    suit,
    rank,
    imageUrl: `/assets/durak/${suit}_${rank}.jpg`,
  };
}

function makeRoom(overrides: Partial<DurakRoomState> = {}): DurakRoomState {
  return {
    id: 'durak_test',
    mode: 'podkidnoy',
    status: 'waiting',
    maxPlayers: 2,
    stake: 100,
    hasPassword: false,
    hostUserId: 'u1',
    hostUsername: 'Alice',
    players: [
      { userId: 'u1', username: 'Alice', seatIndex: 0, hand: [], passed: false, finishedRank: null },
      { userId: 'u2', username: 'Bob', seatIndex: 1, hand: [], passed: false, finishedRank: null },
    ],
    drawPile: [],
    trumpCard: null,
    trumpSuit: null,
    discardCount: 0,
    table: [],
    phase: 'playing',
    attackerIndex: 0,
    defenderIndex: 1,
    winnerUserIds: [],
    loserUserId: null,
    isDraw: false,
    pot: 0,
    payoutPerWinner: 0,
    createdAt: 1000,
    turnDeadlineAt: null,
    ...overrides,
  };
}

test('1. 32-card deck composition is exact, unique, and excludes Fat Kirill + Timur Snack', () => {
  const deck = buildDurak32Deck();
  assert.equal(deck.length, 32);

  const ids = new Set(deck.map((c) => c.id));
  const itemIds = new Set(deck.map((c) => c.itemId));
  assert.equal(ids.size, 32);
  assert.equal(itemIds.size, 32);

  for (const excluded of DURAK_EXCLUDED_ITEM_IDS) {
    assert.equal(itemIds.has(excluded), false);
  }
  for (const c of deck) {
    assert.ok(c.rank >= 7 && c.rank <= 14);
    assert.match(c.imageUrl, /^\/assets\/durak\/card_.*\.jpg$/);
  }
});

test('2. Initial deal gives 6 cards per player, sets visible trump at bottom of drawPile, and picks lowest-trump attacker', () => {
  const deck = buildDurak32Deck();
  const room = makeRoom({ maxPlayers: 2 });
  startDurakGame(room, deck, { shuffledDeck: deck, now: 5000 });

  assert.equal(room.status, 'playing');
  assert.equal(room.players[0].hand.length, 6);
  assert.equal(room.players[1].hand.length, 6);
  assert.equal(room.drawPile.length, 20);
  assert.deepEqual(room.trumpCard, deck[31]);
  assert.equal(room.trumpSuit, deck[31].suit);
  assert.equal(room.pot, 200);

  // Verify privacy projection never leaks opponent hands
  const aliceView = projectDurakRoomForUser(room, 'u1');
  const bobView = projectDurakRoomForUser(room, 'u2');
  assert.equal(aliceView.myHand.length, 6);
  assert.equal(bobView.myHand.length, 6);
  assert.equal(aliceView.deckCount, 20);
  assert.notDeepEqual(aliceView.myHand.map((c) => c.id), bobView.myHand.map((c) => c.id));
  assert.equal((aliceView.players[1] as unknown as { hand?: unknown }).hand, undefined);
});

test('3. Podkidnoy full bout: attack -> defend -> throw-in -> pass(bito) refills hands in attacker-then-defender order', () => {
  const room = makeRoom({
    status: 'playing',
    trumpSuit: 'spades',
    trumpCard: card('spades', 14),
    drawPile: [card('hearts', 10), card('diamonds', 10), card('clubs', 12), card('clubs', 13)],
    attackerIndex: 0,
    defenderIndex: 1,
    players: [
      {
        userId: 'u1',
        username: 'Alice',
        seatIndex: 0,
        hand: [card('hearts', 7), card('clubs', 7), card('diamonds', 8)],
        passed: false,
        finishedRank: null,
      },
      {
        userId: 'u2',
        username: 'Bob',
        seatIndex: 1,
        hand: [card('hearts', 9), card('spades', 7), card('diamonds', 11)],
        passed: false,
        finishedRank: null,
      },
    ],
  });

  // 7♥ attacks
  applyDurakAction(room, 'u1', { type: 'attack', cardId: 'hearts_7' }, 100);
  assert.equal(room.table.length, 1);

  // Cannot throw mismatched rank 8♦
  assert.throws(() => applyDurakAction(room, 'u1', { type: 'attack', cardId: 'diamonds_8' }, 101));

  // Bob cannot beat 7♥ with 11♦ (wrong suit, not trump)
  assert.throws(() => applyDurakAction(room, 'u2', { type: 'defend', cardId: 'diamonds_11' }, 102));

  // Bob beats 7♥ with 9♥
  applyDurakAction(room, 'u2', { type: 'defend', cardId: 'hearts_9' }, 103);
  assert.equal(room.table[0].defense?.id, 'hearts_9');

  // Alice throws matching rank 7♣
  applyDurakAction(room, 'u1', { type: 'attack', cardId: 'clubs_7' }, 104);
  assert.equal(room.table.length, 2);

  // Bob beats 7♣ with trump 7♠
  applyDurakAction(room, 'u2', { type: 'defend', cardId: 'spades_7' }, 105);

  // Alice passes -> Бито!
  applyDurakAction(room, 'u1', { type: 'pass' }, 106);

  assert.equal(room.table.length, 0);
  assert.equal(room.discardCount, 4);
  // Attacker refilled first (to 5 cards here since 4 were in drawPile and Alice had 1), Bob drew remaining
  assert.equal(room.drawPile.length, 0);
  assert.equal(room.players[0].hand.length, 5);
  assert.equal(room.players[1].hand.length, 1);
  // Previous defender Bob now attacks
  assert.equal(room.attackerIndex, 1);
  assert.equal(room.defenderIndex, 0);
});

test('4. Perevodnoy: 3-player transfer rules, blocks after defense or when next player lacks cards', () => {
  const room = makeRoom({
    mode: 'perevodnoy',
    status: 'playing',
    maxPlayers: 3,
    trumpSuit: 'spades',
    attackerIndex: 0,
    defenderIndex: 1,
    players: [
      { userId: 'u1', username: 'Alice', seatIndex: 0, hand: [card('hearts', 8), card('clubs', 10)], passed: false, finishedRank: null },
      { userId: 'u2', username: 'Bob', seatIndex: 1, hand: [card('diamonds', 8), card('hearts', 12), card('clubs', 12)], passed: false, finishedRank: null },
      { userId: 'u3', username: 'Charlie', seatIndex: 2, hand: [card('clubs', 8), card('hearts', 13)], passed: false, finishedRank: null },
    ],
  });

  // Alice attacks with 8♥ against Bob
  applyDurakAction(room, 'u1', { type: 'attack', cardId: 'hearts_8' }, 200);
  assert.equal(canTransferNow(room, 1, card('diamonds', 8)), true);

  // Bob transfers with 8♦ -> Charlie becomes defender (has 2 cards >= 2 table cards!)
  applyDurakAction(room, 'u2', { type: 'transfer', cardId: 'diamonds_8' }, 201);
  assert.equal(room.table.length, 2);
  assert.equal(room.attackerIndex, 1);
  assert.equal(room.defenderIndex, 2);

  // Charlie wants to transfer with 8♣ onto Alice, who only has 1 card left (needs >= 3!) -> blocked!
  assert.equal(canTransferNow(room, 2, card('clubs', 8)), false);
  assert.throws(() => applyDurakAction(room, 'u3', { type: 'transfer', cardId: 'clubs_8' }, 202));

  // If Charlie defends 1 pair, transfer must also be blocked even in Perevodnoy
  room.players[0].hand.push(card('spades', 9), card('spades', 10));
  applyDurakAction(room, 'u3', { type: 'defend', cardId: 'hearts_13', pairIndex: 0 }, 203);
  assert.equal(canTransferNow(room, 2, card('clubs', 8)), false);
});

test('5. Taking cards (Взять) allows matching throw-in then skips defender turn cleanly', () => {
  const room = makeRoom({
    status: 'playing',
    trumpSuit: 'spades',
    drawPile: [],
    attackerIndex: 0,
    defenderIndex: 1,
    players: [
      { userId: 'u1', username: 'Alice', seatIndex: 0, hand: [card('hearts', 9), card('clubs', 9), card('diamonds', 14)], passed: false, finishedRank: null },
      { userId: 'u2', username: 'Bob', seatIndex: 1, hand: [card('hearts', 7), card('diamonds', 7)], passed: false, finishedRank: null },
    ],
  });

  applyDurakAction(room, 'u1', { type: 'attack', cardId: 'hearts_9' }, 300);
  applyDurakAction(room, 'u2', { type: 'take' }, 301);
  // Alice has 9♣ matching table rank, so phase enters 'taking' awaiting throw-in or pass
  assert.equal(room.phase, 'taking');

  applyDurakAction(room, 'u1', { type: 'attack', cardId: 'clubs_9' }, 302);
  // Now Alice only holds A♦ (cannot match rank 9) -> auto-resolves take immediately!
  assert.equal(room.table.length, 0);
  assert.equal(room.players[1].hand.length, 4);
  // In 2-player Durak when defender takes, next active player after defender is Alice again
  assert.equal(room.attackerIndex, 0);
  assert.equal(room.defenderIndex, 1);
});

test('6. Endgame winner/loser, draw detection, forfeit, and turn timeout recovery', () => {
  // Single card endgame -> Alice clears hand, Bob holds last card -> Bob is Durak
  const room = makeRoom({
    status: 'playing',
    trumpSuit: 'spades',
    drawPile: [],
    pot: 500,
    attackerIndex: 0,
    defenderIndex: 1,
    players: [
      { userId: 'u1', username: 'Alice', seatIndex: 0, hand: [card('hearts', 7)], passed: false, finishedRank: null },
      { userId: 'u2', username: 'Bob', seatIndex: 1, hand: [card('hearts', 8), card('clubs', 10)], passed: false, finishedRank: null },
    ],
  });

  applyDurakAction(room, 'u1', { type: 'attack', cardId: 'hearts_7' }, 400);
  applyDurakAction(room, 'u2', { type: 'defend', cardId: 'hearts_8' }, 401);
  applyDurakAction(room, 'u1', { type: 'pass' }, 402);

  assert.equal(room.status, 'completed');
  assert.equal(room.isDraw, false);
  assert.deepEqual(room.winnerUserIds, ['u1']);
  assert.equal(room.loserUserId, 'u2');
  assert.equal(room.payoutPerWinner, 500);

  // Mutual empty hands -> draw
  const drawRoom = makeRoom({
    status: 'playing',
    trumpSuit: 'spades',
    drawPile: [],
    pot: 200,
    attackerIndex: 0,
    defenderIndex: 1,
    players: [
      { userId: 'u1', username: 'Alice', seatIndex: 0, hand: [card('hearts', 7)], passed: false, finishedRank: null },
      { userId: 'u2', username: 'Bob', seatIndex: 1, hand: [card('hearts', 8)], passed: false, finishedRank: null },
    ],
  });
  applyDurakAction(drawRoom, 'u1', { type: 'attack', cardId: 'hearts_7' }, 500);
  applyDurakAction(drawRoom, 'u2', { type: 'defend', cardId: 'hearts_8' }, 501);
  assert.equal(drawRoom.status, 'completed');
  assert.equal(drawRoom.isDraw, true);
  assert.equal(drawRoom.payoutPerWinner, 100);

  // Timeout resolves stuck round cleanly
  const timeoutRoom = makeRoom({
    status: 'playing',
    trumpSuit: 'spades',
    turnDeadlineAt: 1000,
    players: [
      { userId: 'u1', username: 'Alice', seatIndex: 0, hand: [card('hearts', 7), card('clubs', 9)], passed: false, finishedRank: null },
      { userId: 'u2', username: 'Bob', seatIndex: 1, hand: [card('diamonds', 8), card('clubs', 11)], passed: false, finishedRank: null },
    ],
  });
  const stepped = resolveDurakTimeout(timeoutRoom, 2000);
  assert.ok(stepped);
  assert.equal(timeoutRoom.table.length, 1);

  // Forfeit marks leaving player as Durak
  forfeitDurakPlayer(timeoutRoom, 'u1');
  assert.equal(timeoutRoom.status, 'completed');
  assert.equal(timeoutRoom.loserUserId, 'u1');
  assert.deepEqual(timeoutRoom.winnerUserIds, ['u2']);

  // canBeatCard check
  assert.equal(canBeatCard(card('hearts', 14), card('spades', 7), 'spades'), true);
  assert.equal(canBeatCard(card('spades', 10), card('hearts', 14), 'spades'), false);
  finalizeDurakGame(timeoutRoom, null);
  assert.equal(timeoutRoom.isDraw, true);
});
