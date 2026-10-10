/**
 * Ordered save migrations. MIGRATIONS[i] upgrades a save object from version (i + 1) to (i + 2).
 * Never edit a shipped migration; append a new one and bump CURRENT_VERSION. Every version ever
 * shipped has a fixture in tests/fixtures/saves/ that must keep loading.
 */
export type SaveObj = Record<string, unknown> & { v: number };
export type Migration = (old: SaveObj) => SaveObj;

export const MIGRATIONS: Migration[] = [
  // v1 -> v2: shop decorations were added (owned decoration ids in `dc`).
  (old) => ({ ...old, v: 2, dc: Array.isArray(old.dc) ? old.dc : [] }),
  // v2 -> v3: workshops (`ws`), today's accepted jobs (dy[15]) and job items (item tuple [11]).
  (old) => ({ ...old, v: 3, ws: Array.isArray(old.ws) ? old.ws : [] }),
  // v3 -> v4: company name (`cn`) and the business ladder (`bz` = [owned ids, today's business]).
  // The workshops became businesses: Repair Shop -> Phone Repair, Computer Workshop -> Computer
  // Repair, Car Garage -> Mechanic. Today's taken jobs are cleared (job ids changed).
  (old) => {
    const ws = Array.isArray(old.ws) ? old.ws : [];
    const own = ['reselling'];
    if (ws.length) own.push('phone');
    if (ws.includes('computer')) own.push('computer');
    if (ws.includes('garage')) own.push('mechanic');
    const dy = Array.isArray(old.dy) ? [...(old.dy as unknown[])] : old.dy;
    if (Array.isArray(dy)) dy[15] = [];
    const next: SaveObj = { ...old, v: 4, bz: [own, 'reselling'], dy };
    delete next.ws;
    return next;
  },
  // v4 -> v5: marketing (`br` brand points, dy[16] campaigns run today). Job tuples may now carry a
  // quality target and a client company (older ones simply have none).
  (old) => ({ ...old, v: 5, br: typeof old.br === 'number' ? old.br : 0 }),
  // v5 -> v6: managers (`mg`) and branches (`bn`), none yet.
  (old) => ({ ...old, v: 6, mg: {}, bn: {} }),
  // v6 -> v7: global expansion (`rg`: region -> 1 office open, 2 conquered), none yet.
  (old) => ({ ...old, v: 7, rg: {} }),
];

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
