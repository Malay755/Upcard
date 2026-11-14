import type { ItemCard } from '../types';

export const CANONICAL_COLLECTIONS = [
  'Даун',
  'Артемий',
  'Тимур',
  'Майкл',
  'Ваня',
  'Кирилл',
  'Сквад',
] as const;

export type CanonicalCollection = (typeof CANONICAL_COLLECTIONS)[number];

export const COLLECTION_ACCENTS: Record<string, string> = {
  Даун: 'text-rose-300/90',
  Артемий: 'text-emerald-300/90',
  Тимур: 'text-amber-300/90',
  Майкл: 'text-sky-300/90',
  Ваня: 'text-violet-300/90',
  Кирилл: 'text-fuchsia-300/90',
  Сквад: 'text-slate-300',
};

/**
 * Infers a card collection from its Russian/Latin title.
 * Checks shared thematic words ("Даун") first, then member names.
 */
export function inferCardCollection(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return 'Сквад';

  if (/\bдаун/i.test(normalized) || normalized.includes('даун')) {
    return 'Даун';
  }
  if (/артем/i.test(normalized)) {
    return 'Артемий';
  }
  if (/тимур/i.test(normalized)) {
    return 'Тимур';
  }
  if (/майкл/i.test(normalized)) {
    return 'Майкл';
  }
  if (/(?:^|[\s«"(—-])ван(?:я|и|е|ю|ей)(?:$|[\s»")—.,!?-])/i.test(normalized)) {
    return 'Ваня';
  }
  if (/кирилл|кири[-\s]?тян|кири/i.test(normalized)) {
    return 'Кирилл';
  }
  return 'Сквад';
}

/**
 * Returns the explicit card collection if stored, otherwise infers it from the title.
 */
export function resolveCardCollection(
  item: Pick<ItemCard, 'name' | 'collection'> | null | undefined
): string {
  if (!item) return 'Сквад';
  const explicit = item.collection?.trim();
  if (explicit) return explicit;
  return inferCardCollection(item.name);
}

/**
 * Returns a clean accent text class for a given collection badge/subtitle.
 */
export function getCollectionTextClass(collection: string): string {
  return COLLECTION_ACCENTS[collection] ?? 'text-[#FACC15]/85';
}

/**
 * Lists distinct collections present in the catalog, preserving canonical order first.
 */
export function getAvailableCollections(
  items: Pick<ItemCard, 'name' | 'collection'>[]
): string[] {
  const present = new Set<string>();
  for (const item of items) {
    present.add(resolveCardCollection(item));
  }

  const ordered: string[] = [];
  for (const canonical of CANONICAL_COLLECTIONS) {
    if (present.has(canonical)) {
      ordered.push(canonical);
      present.delete(canonical);
    }
  }
  const extras = [...present].sort((a, b) => a.localeCompare(b, 'ru'));
  return [...ordered, ...extras];
}

/**
 * Filters items by selected collection ('all' returns everything).
 */
export function filterItemsByCollection<T extends Pick<ItemCard, 'name' | 'collection'>>(
  items: T[],
  selectedCollection: string
): T[] {
  if (!selectedCollection || selectedCollection === 'all') return items;
  return items.filter((item) => resolveCardCollection(item) === selectedCollection);
}
