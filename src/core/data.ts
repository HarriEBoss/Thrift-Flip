import itemsJson from '../data/items.json';
import categoriesJson from '../data/categories.json';
import recipesJson from '../data/recipes.json';
import customersJson from '../data/customers.json';
import marketsJson from '../data/markets.json';
import balanceJson from '../data/balance.json';
import requestsJson from '../data/requests.json';
import type {
  Balance,
  CategoryDef,
  CategoryId,
  ItemArchetype,
  MarketDef,
  Persona,
  RecipeStepTemplate,
  RequestTemplate,
} from './types';

export const ITEMS = itemsJson as ItemArchetype[];
export const CATEGORIES = categoriesJson as unknown as CategoryDef[];
export const RECIPES = recipesJson as unknown as Record<CategoryId, RecipeStepTemplate[]>;
export const PERSONAS = customersJson as unknown as Persona[];
export const MARKETS = marketsJson as unknown as MarketDef[];
export const BALANCE = balanceJson as unknown as Balance;
export const REQUESTS = requestsJson as unknown as RequestTemplate[];

const itemIndexById = new Map(ITEMS.map((it, i) => [it.id, i]));

export function itemIndex(id: string): number {
  const i = itemIndexById.get(id);
  if (i === undefined) throw new Error(`Unknown item ${id}`);
  return i;
}

export function category(id: CategoryId): CategoryDef {
  const c = CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown category ${id}`);
  return c;
}

export function market(id: string): MarketDef {
  const m = MARKETS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown market ${id}`);
  return m;
}

export function paletteHex(id: string): string {
  return BALANCE.palette.find((p) => p.id === id)?.hex ?? '#cccccc';
}

export function persona(id: string): Persona {
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown persona ${id}`);
  return p;
}

/** Categories available at a shop tier. */
export function categoriesForTier(tier: number): CategoryId[] {
  return CATEGORIES.filter((c) => c.unlockTier <= tier).map((c) => c.id);
}

export function marketsForTier(tier: number): MarketDef[] {
  return MARKETS.filter((m) => m.unlockTier <= tier);
}
