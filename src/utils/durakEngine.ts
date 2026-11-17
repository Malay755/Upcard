import type {
  DurakBoutPhase,
  DurakCard,
  DurakMode,
  DurakPlayerPublic,
  DurakRoomProjection,
  DurakRoomStatus,
  DurakSuit,
  DurakTablePair,
} from '../types';
import { formatDurakCardShort } from './durakDeck';

export const DURAK_MAX_BOUT_CARDS = 6;
export const DURAK_TURN_TIMEOUT_MS = 45_000;

export interface DurakPlayerState {
  userId: string;
  username: string;
  avatarUrl?: string;
  avatarColor?: string;
  seatIndex: number;
  hand: DurakCard[];
  passed: boolean;
  finishedRank: number | null;
}

export interface DurakRoomState {
  id: string;
  mode: DurakMode;
  status: DurakRoomStatus;
  maxPlayers: number;
  stake: number;
  hasPassword: boolean;
  passwordHash?: string;
  hostUserId: string;
  hostUsername: string;
  players: DurakPlayerState[];
  drawPile: DurakCard[];
  trumpCard: DurakCard | null;
  trumpSuit: DurakSuit | null;
  discardCount: number;
  table: DurakTablePair[];
  phase: DurakBoutPhase;
  attackerIndex: number;
  defenderIndex: number;
  winnerUserIds: string[];
  loserUserId: string | null;
  isDraw: boolean;
  pot: number;
  payoutPerWinner: number;
  createdAt: number;
  startedAt?: number;
  turnDeadlineAt: number | null;
  lastActionText?: string;
}

export type DurakActionPayload =
  | { type: 'attack'; cardId: string }
  | { type: 'defend'; cardId: string; pairIndex?: number }
  | { type: 'transfer'; cardId: string }
  | { type: 'pass' }
  | { type: 'take' };

export class DurakRuleError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function shuffleCards<T>(cards: readonly T[], rng: () => number = Math.random): T[] {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sortHand(hand: readonly DurakCard[], trumpSuit: DurakSuit | null): DurakCard[] {
  const suitOrder: Record<DurakSuit, number> = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };
  return [...hand].sort((a, b) => {
    const aTrump = trumpSuit && a.suit === trumpSuit ? 1 : 0;
    const bTrump = trumpSuit && b.suit === trumpSuit ? 1 : 0;
    if (aTrump !== bTrump) return aTrump - bTrump;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return suitOrder[a.suit] - suitOrder[b.suit];
  });
}

export function canBeatCard(attack: DurakCard, defense: DurakCard, trumpSuit: DurakSuit | null): boolean {
  if (defense.suit === attack.suit) {
    return defense.rank > attack.rank;
  }
  if (trumpSuit && defense.suit === trumpSuit && attack.suit !== trumpSuit) {
    return true;
  }
  return false;
}

export function isPlayerActive(player: DurakPlayerState): boolean {
  return player.finishedRank === null && (player.hand.length > 0);
}

export function nextActivePlayerIndex(players: readonly DurakPlayerState[], fromIndex: number): number {
  const count = players.length;
  for (let step = 1; step <= count; step++) {
    const idx = (fromIndex + step) % count;
    if (players[idx].finishedRank === null) {
      return idx;
    }
  }
  return fromIndex;
}

export function getActivePlayerIndices(players: readonly DurakPlayerState[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < players.length; i++) {
    if (players[i].finishedRank === null) indices.push(i);
  }
  return indices;
}

export function findLowestTrumpAttackerIndex(
  players: readonly DurakPlayerState[],
  trumpSuit: DurakSuit
): number {
  let bestIdx = 0;
  let bestRank = Infinity;
  for (let i = 0; i < players.length; i++) {
    for (const card of players[i].hand) {
      if (card.suit === trumpSuit && card.rank < bestRank) {
        bestRank = card.rank;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

export function startDurakGame(
  room: DurakRoomState,
  deckCards: readonly DurakCard[],
  options: { rng?: () => number; now?: number; shuffledDeck?: DurakCard[] } = {}
): DurakRoomState {
  if (room.status !== 'waiting') {
    throw new DurakRuleError('Игра уже запущена или завершена.', 409);
  }
  if (room.players.length < 2) {
    throw new DurakRuleError('Для начала партии нужно минимум 2 игрока.', 400);
  }
  if (deckCards.length !== 32) {
    throw new DurakRuleError('Колода для Дурака должна содержать ровно 32 карты.', 500);
  }

  const now = options.now ?? Date.now();
  const shuffled = options.shuffledDeck ? [...options.shuffledDeck] : shuffleCards(deckCards, options.rng);
  const players: DurakPlayerState[] = room.players.map((p, idx) => ({
    ...p,
    seatIndex: idx,
    hand: [],
    passed: false,
    finishedRank: null,
  }));

  let cursor = 0;
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < players.length; i++) {
      players[i].hand.push(shuffled[cursor++]);
    }
  }

  const remaining = shuffled.slice(cursor);
  // Last card of remaining pile sits face-up underneath the deck as the visible trump
  const trumpCard = remaining[remaining.length - 1] ?? null;
  const trumpSuit = trumpCard?.suit ?? shuffled[shuffled.length - 1].suit;

  for (const player of players) {
    player.hand = sortHand(player.hand, trumpSuit);
  }

  const attackerIndex = findLowestTrumpAttackerIndex(players, trumpSuit);
  const defenderIndex = nextActivePlayerIndex(players, attackerIndex);

  room.status = 'playing';
  room.players = players;
  room.drawPile = remaining;
  room.trumpCard = trumpCard;
  room.trumpSuit = trumpSuit;
  room.discardCount = 0;
  room.table = [];
  room.phase = 'playing';
  room.attackerIndex = attackerIndex;
  room.defenderIndex = defenderIndex;
  room.winnerUserIds = [];
  room.loserUserId = null;
  room.isDraw = false;
  room.pot = room.stake * players.length;
  room.payoutPerWinner = 0;
  room.startedAt = now;
  room.turnDeadlineAt = now + DURAK_TURN_TIMEOUT_MS;
  room.lastActionText = `Партия началась! Первым ходит ${players[attackerIndex].username}.`;
  return room;
}

function getUncoveredPairsCount(table: readonly DurakTablePair[]): number {
  return table.reduce((count, pair) => count + (pair.defense ? 0 : 1), 0);
}

function getTableRankSet(table: readonly DurakTablePair[]): Set<number> {
  const ranks = new Set<number>();
  for (const pair of table) {
    ranks.add(pair.attack.rank);
    if (pair.defense) ranks.add(pair.defense.rank);
  }
  return ranks;
}

export function canTransferNow(room: DurakRoomState, playerIndex: number, card: DurakCard): boolean {
  if (room.mode !== 'perevodnoy') return false;
  if (room.status !== 'playing' || room.phase !== 'playing') return false;
  if (playerIndex !== room.defenderIndex) return false;
  if (room.table.length === 0) return false;
  if (room.table.some((p) => p.defense !== null)) return false;
  if (room.table.length >= DURAK_MAX_BOUT_CARDS) return false;
  if (card.rank !== room.table[0].attack.rank) return false;

  const nextDefIdx = nextActivePlayerIndex(room.players, room.defenderIndex);
  if (nextDefIdx === room.defenderIndex) return false;
  return room.players[nextDefIdx].hand.length >= room.table.length + 1;
}

function canAnyoneElseThrowIn(room: DurakRoomState): boolean {
  if (room.table.length >= DURAK_MAX_BOUT_CARDS) return false;
  const defender = room.players[room.defenderIndex];
  if (!defender) return false;
  const uncovered = getUncoveredPairsCount(room.table);
  if (uncovered >= defender.hand.length) return false;
  const tableRanks = getTableRankSet(room.table);
  return room.players.some(
    (p, idx) =>
      idx !== room.defenderIndex &&
      p.finishedRank === null &&
      !p.passed &&
      p.hand.some((card) => tableRanks.has(card.rank))
  );
}

function activeNonDefenderIndices(room: DurakRoomState): number[] {
  return room.players
    .map((p, idx) => ({ p, idx }))
    .filter(({ p, idx }) => idx !== room.defenderIndex && p.finishedRank === null)
    .map(({ idx }) => idx);
}

function refillAndRotateBout(room: DurakRoomState, defenderTook: boolean, now: number): void {
  const defender = room.players[room.defenderIndex];
  const prevAttackerIdx = room.attackerIndex;
  const prevDefenderIdx = room.defenderIndex;

  if (defenderTook) {
    const takenCards: DurakCard[] = [];
    for (const pair of room.table) {
      takenCards.push(pair.attack);
      if (pair.defense) takenCards.push(pair.defense);
    }
    defender.hand = sortHand([...defender.hand, ...takenCards], room.trumpSuit);
  } else {
    let discarded = 0;
    for (const pair of room.table) {
      discarded += pair.defense ? 2 : 1;
    }
    room.discardCount += discarded;
  }

  room.table = [];
  room.phase = 'playing';

  // Official refill order: primary attacker -> other attackers clockwise -> defender last
  const drawOrder: number[] = [];
  const count = room.players.length;
  for (let step = 0; step < count; step++) {
    const idx = (prevAttackerIdx + step) % count;
    if (idx !== prevDefenderIdx && room.players[idx].finishedRank === null) {
      drawOrder.push(idx);
    }
  }
  if (room.players[prevDefenderIdx].finishedRank === null) {
    drawOrder.push(prevDefenderIdx);
  }

  for (const idx of drawOrder) {
    const player = room.players[idx];
    while (player.hand.length < 6 && room.drawPile.length > 0) {
      const drawn = room.drawPile.shift()!;
      player.hand.push(drawn);
    }
    player.hand = sortHand(player.hand, room.trumpSuit);
    player.passed = false;
  }

  // Mark players who emptied their hand once drawPile is empty
  if (room.drawPile.length === 0) {
    let nextRank = room.players.filter((p) => p.finishedRank !== null).length + 1;
    for (const idx of drawOrder) {
      const p = room.players[idx];
      if (p.finishedRank === null && p.hand.length === 0) {
        p.finishedRank = nextRank++;
      }
    }
  }

  const stillPlaying = getActivePlayerIndices(room.players);
  if (stillPlaying.length <= 1) {
    finalizeDurakGame(room, stillPlaying.length === 1 ? room.players[stillPlaying[0]].userId : null);
    return;
  }

  // Determine next attacker & defender
  let nextAttacker: number;
  if (defenderTook) {
    nextAttacker = nextActivePlayerIndex(room.players, prevDefenderIdx);
  } else if (room.players[prevDefenderIdx].finishedRank === null) {
    nextAttacker = prevDefenderIdx;
  } else {
    nextAttacker = nextActivePlayerIndex(room.players, prevDefenderIdx);
  }

  const nextDefender = nextActivePlayerIndex(room.players, nextAttacker);
  room.attackerIndex = nextAttacker;
  room.defenderIndex = nextDefender;
  room.turnDeadlineAt = now + DURAK_TURN_TIMEOUT_MS;
}

export function finalizeDurakGame(room: DurakRoomState, loserUserId: string | null): void {
  room.status = 'completed';
  room.turnDeadlineAt = null;
  room.table = [];
  room.phase = 'playing';

  if (!loserUserId) {
    room.loserUserId = null;
    room.isDraw = true;
    room.winnerUserIds = room.players.map((p) => p.userId);
    room.payoutPerWinner = room.players.length > 0 ? Math.floor(room.pot / room.players.length) : 0;
    room.lastActionText = 'Ничья! Все карты вышли одновременно.';
    return;
  }

  room.loserUserId = loserUserId;
  room.isDraw = false;
  room.winnerUserIds = room.players.filter((p) => p.userId !== loserUserId).map((p) => p.userId);
  room.payoutPerWinner = room.winnerUserIds.length > 0 ? Math.floor(room.pot / room.winnerUserIds.length) : 0;
  const loserName = room.players.find((p) => p.userId === loserUserId)?.username ?? 'Игрок';
  room.lastActionText = `Партия завершена! В дураках остался ${loserName}.`;
}

export function applyDurakAction(
  room: DurakRoomState,
  actorUserId: string,
  action: DurakActionPayload,
  now = Date.now()
): DurakRoomState {
  if (room.status !== 'playing') {
    throw new DurakRuleError('Партия не активна.', 409);
  }
  const actorIndex = room.players.findIndex((p) => p.userId === actorUserId);
  if (actorIndex < 0) {
    throw new DurakRuleError('Вы не являетесь участником этого стола.', 403);
  }
  const actor = room.players[actorIndex];
  if (actor.finishedRank !== null) {
    throw new DurakRuleError('Вы уже вышли из партии.', 400);
  }

  const defender = room.players[room.defenderIndex];

  if (action.type === 'attack') {
    if (actorIndex === room.defenderIndex) {
      throw new DurakRuleError('Защищающийся игрок не может атаковать в этом раунде.', 400);
    }
    if (room.table.length === 0 && actorIndex !== room.attackerIndex) {
      throw new DurakRuleError('Первым в этом раунде ходит ведущий атакующий.', 400);
    }
    if (room.table.length >= DURAK_MAX_BOUT_CARDS) {
      throw new DurakRuleError('На столе уже максимум 6 карт атаки.', 400);
    }
    const uncovered = getUncoveredPairsCount(room.table);
    if (uncovered >= defender.hand.length) {
      throw new DurakRuleError('Нельзя подкинуть больше карт, чем осталось у защищающегося.', 400);
    }

    const cardIdx = actor.hand.findIndex((c) => c.id === action.cardId);
    if (cardIdx < 0) {
      throw new DurakRuleError('Выбранная карта отсутствует у вас на руке.', 400);
    }
    const card = actor.hand[cardIdx];

    if (room.table.length > 0) {
      const tableRanks = getTableRankSet(room.table);
      if (!tableRanks.has(card.rank)) {
        throw new DurakRuleError('Подкидывать можно только карты того же ранга, что уже лежат на столе.', 400);
      }
    }

    actor.hand.splice(cardIdx, 1);
    room.table.push({ attack: card, defense: null });
    for (const p of room.players) p.passed = false;
    room.turnDeadlineAt = now + DURAK_TURN_TIMEOUT_MS;
    room.lastActionText = `${actor.username} пошёл: ${formatDurakCardShort(card)} (${card.name}).`;

    // If defender already surrendered ('taking') and no further cards can be thrown, finish bout immediately
    if (room.phase === 'taking' && !canAnyoneElseThrowIn(room)) {
      refillAndRotateBout(room, true, now);
    }
    return room;
  }

  if (action.type === 'transfer') {
    if (room.mode !== 'perevodnoy') {
      throw new DurakRuleError('Перевод доступен только в режиме «Переводной дурак».', 400);
    }
    if (actorIndex !== room.defenderIndex) {
      throw new DurakRuleError('Перевести может только защищающийся игрок.', 400);
    }
    if (room.phase !== 'playing') {
      throw new DurakRuleError('Вы уже решили забрать карты со стола.', 400);
    }
    const cardIdx = actor.hand.findIndex((c) => c.id === action.cardId);
    if (cardIdx < 0) {
      throw new DurakRuleError('Выбранная карта отсутствует у вас на руке.', 400);
    }
    const card = actor.hand[cardIdx];
    if (!canTransferNow(room, actorIndex, card)) {
      throw new DurakRuleError('Сейчас нельзя перевести: карты не совпадают по рангу, уже есть отбитые карты или у следующего игрока мало карт.', 400);
    }

    const nextDefIdx = nextActivePlayerIndex(room.players, room.defenderIndex);
    actor.hand.splice(cardIdx, 1);
    room.table.push({ attack: card, defense: null });
    room.attackerIndex = actorIndex;
    room.defenderIndex = nextDefIdx;
    for (const p of room.players) p.passed = false;
    room.turnDeadlineAt = now + DURAK_TURN_TIMEOUT_MS;
    room.lastActionText = `${actor.username} перевёл картой ${formatDurakCardShort(card)} на ${room.players[nextDefIdx].username}!`;
    return room;
  }

  if (action.type === 'defend') {
    if (actorIndex !== room.defenderIndex) {
      throw new DurakRuleError('Отбиваться может только защищающийся игрок.', 400);
    }
    if (room.phase !== 'playing') {
      throw new DurakRuleError('Вы уже выбрали «Взять».', 400);
    }
    const cardIdx = actor.hand.findIndex((c) => c.id === action.cardId);
    if (cardIdx < 0) {
      throw new DurakRuleError('Выбранная карта отсутствует у вас на руке.', 400);
    }
    const card = actor.hand[cardIdx];

    const uncoveredIndices = room.table
      .map((pair, idx) => (pair.defense === null ? idx : -1))
      .filter((idx) => idx >= 0);
    if (uncoveredIndices.length === 0) {
      throw new DurakRuleError('Все карты на столе уже отбиты.', 400);
    }

    let targetPairIndex: number;
    if (typeof action.pairIndex === 'number' && Number.isInteger(action.pairIndex)) {
      if (!uncoveredIndices.includes(action.pairIndex)) {
        throw new DurakRuleError('Выбранная карта атаки уже отбита или не найдена.', 400);
      }
      targetPairIndex = action.pairIndex;
    } else if (uncoveredIndices.length === 1) {
      targetPairIndex = uncoveredIndices[0];
    } else {
      const beatable = uncoveredIndices.filter((idx) =>
        canBeatCard(room.table[idx].attack, card, room.trumpSuit)
      );
      if (beatable.length !== 1) {
        throw new DurakRuleError('Укажите конкретную карту на столе, которую хотите отбить.', 400);
      }
      targetPairIndex = beatable[0];
    }

    const attackCard = room.table[targetPairIndex].attack;
    if (!canBeatCard(attackCard, card, room.trumpSuit)) {
      throw new DurakRuleError(
        `Карта ${formatDurakCardShort(card)} не бьёт ${formatDurakCardShort(attackCard)}.`,
        400
      );
    }

    actor.hand.splice(cardIdx, 1);
    room.table[targetPairIndex].defense = card;
    for (const p of room.players) p.passed = false;
    room.turnDeadlineAt = now + DURAK_TURN_TIMEOUT_MS;
    room.lastActionText = `${actor.username} отбил ${formatDurakCardShort(attackCard)} картой ${formatDurakCardShort(card)}.`;

    const allCovered = getUncoveredPairsCount(room.table) === 0;
    if (allCovered && (actor.hand.length === 0 || !canAnyoneElseThrowIn(room))) {
      // Defender has 0 cards left OR nobody else holds a matching card -> Бито immediately
      if (actor.hand.length === 0) {
        refillAndRotateBout(room, false, now);
      }
    }
    return room;
  }

  if (action.type === 'take') {
    if (actorIndex !== room.defenderIndex) {
      throw new DurakRuleError('Забрать карты может только защищающийся.', 400);
    }
    if (room.phase !== 'playing') {
      throw new DurakRuleError('Вы уже решили забрать карты.', 400);
    }
    if (getUncoveredPairsCount(room.table) === 0) {
      throw new DurakRuleError('Нечего забирать: все карты на столе уже отбиты.', 400);
    }

    room.phase = 'taking';
    for (const p of room.players) p.passed = false;
    room.turnDeadlineAt = now + DURAK_TURN_TIMEOUT_MS;
    room.lastActionText = `${actor.username} берёт карты со стола.`;

    if (!canAnyoneElseThrowIn(room)) {
      refillAndRotateBout(room, true, now);
    }
    return room;
  }

  if (action.type === 'pass') {
    if (actorIndex === room.defenderIndex) {
      throw new DurakRuleError('Защищающийся не может нажать «Бито».', 400);
    }
    if (room.table.length === 0) {
      throw new DurakRuleError('Сначала сделайте первый ход на стол.', 400);
    }
    if (room.phase === 'playing' && getUncoveredPairsCount(room.table) > 0) {
      throw new DurakRuleError('Дождитесь, пока защищающийся отобьёт все карты или нажмёт «Взять».', 400);
    }

    actor.passed = true;
    const nonDefenders = activeNonDefenderIndices(room);
    const allPassed = nonDefenders.every((idx) => room.players[idx].passed);
    if (allPassed) {
      const taking = room.phase === 'taking';
      room.lastActionText = taking
        ? `${defender.username} забрал карты со стола.`
        : 'Бито! Карты отправлены в отбой.';
      refillAndRotateBout(room, taking, now);
    } else {
      room.lastActionText = `${actor.username} сказал «Пас».`;
    }
    return room;
  }

  throw new DurakRuleError('Неизвестное действие.', 400);
}

export function resolveDurakTimeout(room: DurakRoomState, now = Date.now()): DurakRoomState | null {
  if (room.status !== 'playing' || !room.turnDeadlineAt || now < room.turnDeadlineAt) {
    return null;
  }

  const uncovered = getUncoveredPairsCount(room.table);
  if (room.table.length === 0) {
    const attacker = room.players[room.attackerIndex];
    if (attacker && attacker.hand.length > 0) {
      const sorted = sortHand(attacker.hand, room.trumpSuit);
      return applyDurakAction(room, attacker.userId, { type: 'attack', cardId: sorted[0].id }, now);
    }
  } else if (room.phase === 'playing' && uncovered > 0) {
    const defender = room.players[room.defenderIndex];
    if (defender) {
      const updated = applyDurakAction(room, defender.userId, { type: 'take' }, now);
      if (updated.status === 'playing' && (updated.phase as DurakBoutPhase) === 'taking') {
        refillAndRotateBout(updated, true, now);
      }
      return updated;
    }
  } else {
    const taking = room.phase === 'taking';
    refillAndRotateBout(room, taking, now);
    return room;
  }

  return null;
}

export function forfeitDurakPlayer(room: DurakRoomState, userId: string): DurakRoomState {
  if (room.status !== 'playing') {
    throw new DurakRuleError('Партия не активна.', 409);
  }
  const exists = room.players.some((p) => p.userId === userId);
  if (!exists) {
    throw new DurakRuleError('Вы не участвуете в этом столе.', 403);
  }
  finalizeDurakGame(room, userId);
  return room;
}

export function projectDurakRoomForUser(room: DurakRoomState, viewerUserId?: string): DurakRoomProjection {
  const viewer = viewerUserId ? room.players.find((p) => p.userId === viewerUserId) : undefined;
  const playersPublic: DurakPlayerPublic[] = room.players.map((p) => ({
    userId: p.userId,
    username: p.username,
    avatarUrl: p.avatarUrl,
    avatarColor: p.avatarColor,
    seatIndex: p.seatIndex,
    cardCount: p.hand.length,
    passed: p.passed,
    finishedRank: p.finishedRank,
  }));

  return {
    id: room.id,
    mode: room.mode,
    status: room.status,
    maxPlayers: room.maxPlayers,
    stake: room.stake,
    hasPassword: room.hasPassword,
    hostUserId: room.hostUserId,
    hostUsername: room.hostUsername,
    players: playersPublic,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    trumpSuit: room.trumpSuit,
    trumpCard: room.drawPile.length > 0 ? room.trumpCard : null,
    deckCount: room.drawPile.length,
    discardCount: room.discardCount,
    table: room.table.map((pair) => ({ ...pair })),
    phase: room.phase,
    attackerIndex: room.attackerIndex,
    defenderIndex: room.defenderIndex,
    turnDeadlineAt: room.turnDeadlineAt,
    myHand: viewer ? [...viewer.hand] : [],
    winnerUserIds: [...room.winnerUserIds],
    loserUserId: room.loserUserId,
    isDraw: room.isDraw,
    pot: room.pot,
    payoutPerWinner: room.payoutPerWinner,
    lastActionText: room.lastActionText,
  };
}
