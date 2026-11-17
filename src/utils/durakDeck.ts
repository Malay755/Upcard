import type { DurakCard, DurakRank, DurakSuit, ItemCard } from '../types';

export interface DurakDeckSlot {
  itemId: string;
  suit: DurakSuit;
  rank: DurakRank;
  imageUrl: string;
}

export const DURAK_EXCLUDED_ITEM_IDS = ['card_fat_kirill', 'card_timur_snack'] as const;

export const DURAK_SUIT_ORDER: DurakSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const DURAK_RANK_ORDER: DurakRank[] = [7, 8, 9, 10, 11, 12, 13, 14];

export const DURAK_SUIT_META: Record<DurakSuit, { symbol: string; nameRu: string; isRed: boolean }> = {
  spades: { symbol: '♠', nameRu: 'Пики', isRed: false },
  hearts: { symbol: '♥', nameRu: 'Черви', isRed: true },
  diamonds: { symbol: '♦', nameRu: 'Бубны', isRed: true },
  clubs: { symbol: '♣', nameRu: 'Трефы', isRed: false },
};

export function getDurakRankLabel(rank: DurakRank): string {
  switch (rank) {
    case 11:
      return 'В';
    case 12:
      return 'Д';
    case 13:
      return 'К';
    case 14:
      return 'Т';
    default:
      return String(rank);
  }
}

export const DURAK_32_CARD_SPECS: readonly DurakDeckSlot[] = [
  // Тузы (14)
  { itemId: 'card_tenet_t4', suit: 'spades', rank: 14, imageUrl: '/assets/durak/card_tenet_t4.jpg' },
  { itemId: 'card_alpha_timur', suit: 'hearts', rank: 14, imageUrl: '/assets/durak/card_alpha_timur.jpg' },
  { itemId: 'card_vanya_dripchik', suit: 'diamonds', rank: 14, imageUrl: '/assets/durak/card_vanya_dripchik.jpg' },
  { itemId: 'card_crazy_artemiy', suit: 'clubs', rank: 14, imageUrl: '/assets/durak/card_crazy_artemiy.jpg' },
  // Короли (13)
  { itemId: 'card_timur_svo', suit: 'spades', rank: 13, imageUrl: '/assets/durak/card_timur_svo.jpg' },
  { itemId: 'card_timur_volga', suit: 'hearts', rank: 13, imageUrl: '/assets/durak/card_timur_volga.jpg' },
  { itemId: 'card_photographer_timur', suit: 'diamonds', rank: 13, imageUrl: '/assets/durak/card_photographer_timur.jpg' },
  { itemId: 'card_jopa_michaela', suit: 'clubs', rank: 13, imageUrl: '/assets/durak/card_jopa_michaela.jpg' },
  // Дамы (12)
  { itemId: 'card_moscow_adventure', suit: 'spades', rank: 12, imageUrl: '/assets/durak/card_moscow_adventure.jpg' },
  { itemId: 'card_eblany', suit: 'hearts', rank: 12, imageUrl: '/assets/durak/card_eblany.jpg' },
  { itemId: 'card_usaty_vanya', suit: 'diamonds', rank: 12, imageUrl: '/assets/durak/card_usaty_vanya.jpg' },
  { itemId: 'card_kiri_chan', suit: 'clubs', rank: 12, imageUrl: '/assets/durak/card_kiri_chan.jpg' },
  // Валеты (11)
  { itemId: 'card_crazy_vanya', suit: 'spades', rank: 11, imageUrl: '/assets/durak/card_crazy_vanya.jpg' },
  { itemId: 'card_hunchback_timur', suit: 'hearts', rank: 11, imageUrl: '/assets/durak/card_hunchback_timur.jpg' },
  { itemId: 'card_class_4b', suit: 'diamonds', rank: 11, imageUrl: '/assets/durak/card_class_4b.jpg' },
  { itemId: 'card_drunk_artemiy', suit: 'clubs', rank: 11, imageUrl: '/assets/durak/card_drunk_artemiy.jpg' },
  // Десятки (10)
  { itemId: 'card_down_timur', suit: 'spades', rank: 10, imageUrl: '/assets/durak/card_down_timur.jpg' },
  { itemId: 'card_ptu_ninja', suit: 'hearts', rank: 10, imageUrl: '/assets/durak/card_ptu_ninja.jpg' },
  { itemId: 'card_farmer_timur', suit: 'diamonds', rank: 10, imageUrl: '/assets/durak/card_farmer_timur.jpg' },
  { itemId: 'card_bro_kirill', suit: 'clubs', rank: 10, imageUrl: '/assets/durak/card_bro_kirill.jpg' },
  // Девятки (9)
  { itemId: 'card_emo_michael', suit: 'spades', rank: 9, imageUrl: '/assets/durak/card_emo_michael.jpg' },
  { itemId: 'card_spy_michael', suit: 'hearts', rank: 9, imageUrl: '/assets/durak/card_spy_michael.jpg' },
  { itemId: 'card_artemiy_derp', suit: 'diamonds', rank: 9, imageUrl: '/assets/durak/card_artemiy_derp.jpg' },
  { itemId: 'card_timur_ai', suit: 'clubs', rank: 9, imageUrl: '/assets/durak/card_timur_ai.jpg' },
  // Восьмёрки (8)
  { itemId: 'card_schumachers', suit: 'spades', rank: 8, imageUrl: '/assets/durak/card_schumachers.jpg' },
  { itemId: 'card_ahegao_artemiy', suit: 'hearts', rank: 8, imageUrl: '/assets/durak/card_ahegao_artemiy.jpg' },
  { itemId: 'card_hustler_artemiy', suit: 'diamonds', rank: 8, imageUrl: '/assets/durak/card_hustler_artemiy.jpg' },
  { itemId: 'card_campfire_talk', suit: 'clubs', rank: 8, imageUrl: '/assets/durak/card_campfire_talk.jpg' },
  // Семёрки (7)
  { itemId: 'card_kirill_shorts', suit: 'spades', rank: 7, imageUrl: '/assets/durak/card_kirill_shorts.jpg' },
  { itemId: 'card_michael_pizdyuk', suit: 'hearts', rank: 7, imageUrl: '/assets/durak/card_michael_pizdyuk.jpg' },
  { itemId: 'card_artemiy_daun', suit: 'diamonds', rank: 7, imageUrl: '/assets/durak/card_artemiy_daun.jpg' },
  { itemId: 'card_timur_derevenshchina', suit: 'clubs', rank: 7, imageUrl: '/assets/durak/card_timur_derevenshchina.jpg' },
] as const;

const SPEC_BY_ITEM_ID = new Map<string, DurakDeckSlot>(
  DURAK_32_CARD_SPECS.map((slot) => [slot.itemId, slot])
);

export function getDurakSpecByItemId(itemId: string): DurakDeckSlot | undefined {
  return SPEC_BY_ITEM_ID.get(itemId);
}

export function applyDurakDeckMetadata(items: ItemCard[]): ItemCard[] {
  return items.map((item) => {
    const spec = SPEC_BY_ITEM_ID.get(item.id);
    if (!spec) return item;
    return {
      ...item,
      durakSuit: spec.suit,
      durakRank: spec.rank,
      durakImageUrl: spec.imageUrl,
    };
  });
}

export function buildDurak32Deck(items: ItemCard[] = []): DurakCard[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return DURAK_32_CARD_SPECS.map((spec) => {
    const item = byId.get(spec.itemId);
    return {
      id: `${spec.suit}_${spec.rank}`,
      itemId: spec.itemId,
      name: item?.name ?? spec.itemId,
      suit: spec.suit,
      rank: spec.rank,
      imageUrl: item?.durakImageUrl ?? spec.imageUrl,
    };
  });
}

export function formatDurakCardShort(card: Pick<DurakCard, 'suit' | 'rank'>): string {
  return `${getDurakRankLabel(card.rank)}${DURAK_SUIT_META[card.suit].symbol}`;
}
