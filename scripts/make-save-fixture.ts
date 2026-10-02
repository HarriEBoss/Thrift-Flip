/** Writes tests/fixtures/saves/v<CURRENT>-*.json from scripted states. Run once per shipped schema version. */
import { writeFileSync } from 'node:fs';
import { serialize } from '../src/core/save/schema';
import { CURRENT_VERSION } from '../src/core/save/migrations';
import { newGame } from '../src/core/state';
import { buyOffer, generateOffers } from '../src/core/market';
import { advancePhase, completeSale, finishRestoration, recordStep } from '../src/core/day';
import { recipeFor } from '../src/core/items';

const fresh = newGame(20261002);
writeFileSync(`tests/fixtures/saves/v${CURRENT_VERSION}-fresh.json`, serialize(fresh));

const mid = newGame(424242);
const [mug] = generateOffers(mid);
const inst = buyOffer(mid, mug)!;
advancePhase(mid, 'workshop');
recipeFor(inst).forEach((_, i) => recordStep(inst, i, 0.9));
finishRestoration(mid, inst);
advancePhase(mid, 'shop');
completeSale(mid, inst, 12);
advancePhase(mid, 'summary');
advancePhase(mid, 'market');
mid.coins += 500;
const offers = generateOffers(mid);
buyOffer(mid, offers[0]);
buyOffer(mid, offers[1]);
mid.requests.push({ t: 'any_kitchen', p: 'chef', day: 2 });
mid.settings.music = 0.3;
writeFileSync(`tests/fixtures/saves/v${CURRENT_VERSION}-midgame.json`, serialize(mid));
console.log('fixtures written for v' + CURRENT_VERSION);
