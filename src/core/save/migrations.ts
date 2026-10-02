/**
 * Ordered save migrations. MIGRATIONS[i] upgrades a save object from version (i + 1) to (i + 2).
 * Never edit a shipped migration; append a new one and bump CURRENT_VERSION. Every version ever
 * shipped has a fixture in tests/fixtures/saves/ that must keep loading.
 */
export type SaveObj = Record<string, unknown> & { v: number };
export type Migration = (old: SaveObj) => SaveObj;

export const MIGRATIONS: Migration[] = [];

export const CURRENT_VERSION = MIGRATIONS.length + 1;

export function migrate(obj: SaveObj): SaveObj {
  let cur = obj;
  while (cur.v < CURRENT_VERSION) {
    const m = MIGRATIONS[cur.v - 1];
    if (!m) throw new Error(`No migration from v${cur.v}`);
    const next = m(cur);
    if (next.v !== cur.v + 1) throw new Error(`Migration from v${cur.v} produced v${next.v}`);
    cur = next;
  }
  return cur;
}
