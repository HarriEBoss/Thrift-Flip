import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { Button, ProgressBar, drawCard, drawStar, makeText } from '../ui/widgets';
import { drawStepIcon, iconAd, iconArrow } from '../ui/icons';
import { Coach } from '../ui/coach';
import { C, FS, RARITY_COLORS } from '../theme';
import { session } from '../session';
import {
  buildDamage,
  compositeDamaged,
  crackCanvas,
  LAYER_ORDER,
  releaseDamage,
  type DamageSet,
} from '../art/damage';
import { boxFor, ctx2d, drawItem, makeCanvas, releaseCanvas, setColorBlindMode } from '../art/itemArt';
import { MiniGame, STAGE, type MiniCtx } from '../minigames/MiniGame';
import { EraseGame } from '../minigames/EraseGame';
import { StickerGame } from '../minigames/StickerGame';
import { GlueGame } from '../minigames/GlueGame';
import { PaintGame } from '../minigames/PaintGame';
import { RepairGame } from '../minigames/RepairGame';
import { DesignGame } from '../minigames/DesignGame';
import { completeJob, type JobResult } from '../../core/jobs';
import { isReselling } from '../../core/empire';
import { ITEMS, persona } from '../../core/data';
import { instanceValue, qualityOf, recipeFor, type RecipeStep } from '../../core/items';
import { dailyItem, recordDaily } from '../../core/daily';
import {
  advancePhase,
  finishRestoration,
  recordStep,
  workshopQueue,
  type RestoreResult,
} from '../../core/day';
import { hasPerk, toolParams } from '../../core/perks';
import { trendColor } from '../../core/trends';
import { starsFor } from '../../core/economy';
import type { ItemInstance } from '../../core/state';
import type { StepKind } from '../../core/types';
import { REWARD_IDS } from '../../platform/Platform';
import { t } from '../../i18n';
import { rarityLabel } from './MarketScene';

type View = 'steps' | 'reveal';

export class WorkshopScene extends GameScene {
  private inst: ItemInstance | null = null;
  private set: DamageSet | null = null;
  private recipe: RecipeStep[] = [];
  private stepIdx = 0;
  private mini: MiniGame | null = null;
  private stage!: Phaser.GameObjects.Container;
  private stageFrame!: Phaser.GameObjects.Graphics;
  private layerImages: Partial<Record<StepKind, Phaser.GameObjects.Image>> = {};
  private crackG: Phaser.GameObjects.Graphics | null = null;
  private stickerImg: Phaser.GameObjects.Image | null = null;
  private chips!: Phaser.GameObjects.Container;
  private instruction!: Phaser.GameObjects.Text;
  private bar!: ProgressBar;
  private panel!: Phaser.GameObjects.Container;
  private doneBtn!: Button;
  private skipBtn!: Button;
  private goldBtn!: Button;
  private counter!: Phaser.GameObjects.Text;
  private texSize = 512;
  private key = '';
  private down = false;
  private lastMove = 0;
  private view: View = 'steps';
  private reveal: Phaser.GameObjects.Container | null = null;
  /** The reveal's before/after sweep state (its tween must stop when the item is cleaned up). */
  private revealSplit: { f: number } | null = null;
  private revealSweep: Phaser.Tweens.TweenChain | null = null;
  private stageSize = STAGE;
  private paintChoice: string | null = null;
  private stepLocked = false;
  private coach: Coach | null = null;
  private itemNo = 0;
  private itemTotal = 0;
  /** Daily Fix mode: the date key, or null for the normal day flow. */
  private dailyKey: string | null = null;
  private dailyDone = false;
  private dailyResult: { stars: number; reward: number } | null = null;

  constructor() {
    super('Workshop');
  }

  protected hudTitle(): string {
    return this.dailyKey ? t('menu.daily') : t('phase.workshop');
  }

  protected build(data?: unknown): void {
    this.dailyKey = (data as { daily?: string } | undefined)?.daily ?? null;
    this.dailyDone = false;
    this.dailyResult = null;
    // Phaser reuses scene instances: reset per-visit state.
    this.inst = null;
    this.set = null;
    this.recipe = [];
    this.stepIdx = 0;
    this.mini = null;
    this.layerImages = {};
    this.crackG = null;
    this.stickerImg = null;
    this.down = false;
    this.view = 'steps';
    this.reveal = null;
    this.revealSplit = null;
    this.revealSweep = null;
    this.paintChoice = null;
    this.stepLocked = false;
    this.coach = null;
    this.key = '';
    const s = session.state;
    if (!this.dailyKey && s.day.ph === 'market') advancePhase(s, 'workshop');
    if (!this.dailyKey && s.day.ph !== 'workshop') {
      this.scene.start(s.day.ph === 'shop' ? 'Shop' : 'Summary');
      return;
    }
    setColorBlindMode(s.settings.cbPalette);
    this.bgColors = { base: 0xe9f4f1, dots: 0xd6ebe6 };
    session.audio.music('work');
    this.buildHud();
    this.stageFrame = this.add.graphics();
    this.stage = this.add.container(0, 0);
    this.chips = this.add.container(0, 0);
    this.instruction = this.txt(0, 0, '', FS.body, C.ink, { wrap: 640 });
    this.bar = new ProgressBar(this, 0, 0, 420, 26, C.leaf);
    this.panel = this.add.container(0, 0);
    this.counter = this.txt(0, 0, '', FS.small, C.inkSoft);
    this.doneBtn = new Button(this, 0, 0, {
      w: 220,
      h: 80,
      label: t('mg.done'),
      color: C.leaf,
      fontSize: FS.h3,
      onClick: () => this.completeStep(),
    });
    this.skipBtn = new Button(this, 0, 0, {
      w: 180,
      h: 72,
      label: t('common.skip'),
      color: C.inkSoft,
      onClick: () => this.skipStep(),
    });
    this.goldBtn = new Button(this, 0, 0, {
      w: 260,
      h: 72,
      label: t('mg.golden'),
      color: C.mustardDark,
      fontSize: FS.small,
      icon: (g, sz) => iconAd(g, sz),
      onClick: () => void this.useGolden(),
    });
    this.mark('done', this.doneBtn);
    this.mark('skip', this.skipBtn);
    this.mark('golden', this.goldBtn);
    this.root.add([
      this.stageFrame,
      this.stage,
      this.chips,
      this.instruction,
      this.bar,
      this.panel,
      this.counter,
      this.doneBtn,
      this.skipBtn,
      this.goldBtn,
    ]);
    this.itemTotal = this.dailyKey ? 1 : workshopQueue(s).length;
    this.itemNo = 0;
    if (!s.flags.tutorialDone && !this.dailyKey) this.coach = new Coach(this);

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupItem());
    this.nextItem();
  }

  protected layout(): void {
    if (!this.stage) return;
    const f = this.frame;
    this.layoutHud();
    let S: number;
    let sx: number;
    let sy: number;
    if (f.portrait) {
      S = Math.max(340, Math.min(600, f.h - 640));
      sx = (f.w - S) / 2;
      sy = 290;
      this.chips.setPosition(f.w / 2, 150);
      this.instruction.setPosition(f.w / 2, 236);
      this.bar.setPosition(f.w / 2, sy + S + 34);
      this.counter.setPosition(f.w / 2, sy + S + 72);
      const py = sy + S + (f.h < 1100 ? 145 : 170);
      this.panel.setPosition(f.w / 2, py);
      const by = f.h - 60;
      this.doneBtn.setPosition(f.w / 2 + 60, by);
      this.skipBtn.setPosition(f.w / 2 - 150, by);
      this.goldBtn.setPosition(f.w / 2, py - 40);
    } else {
      S = Math.max(360, Math.min(600, f.h - 130));
      sx = 40;
      sy = 110;
      const rx = (sx + S + f.w) / 2 + 10;
      this.chips.setPosition(rx, 160);
      this.instruction.setPosition(rx, 230);
      this.bar.setPosition(rx, 290);
      this.counter.setPosition(rx, 326);
      this.panel.setPosition(rx, 440);
      this.doneBtn.setPosition(rx + 120, f.h - 70);
      this.skipBtn.setPosition(rx - 120, f.h - 70);
      this.goldBtn.setPosition(rx, 400);
      this.homeBtn.setPosition(sx + S + 60, f.h - 54);
    }
    this.instruction.setWordWrapWidth(f.portrait ? f.w - 60 : f.w - S - 120);
    this.stageSize = S;
    this.stage.setPosition(sx, sy);
    this.stage.setScale(S / STAGE);
    this.stageFrame.clear();
    drawCard(this.stageFrame, sx - 12, sy - 12, S + 24, S + 24, C.white, {
      radius: 32,
      stroke: C.ink,
      strokeW: 5,
      shadow: 8,
    });
    // Workbench cutting mat: a soft grid behind the item.
    const cell = S / 8;
    this.stageFrame.fillStyle(0xeef6f3, 1);
    this.stageFrame.fillRect(sx, sy, S, S);
    this.stageFrame.fillStyle(0xd5ebe5, 1);
    const line = Math.max(2, S / 160);
    for (let i = 1; i < 8; i++) {
      this.stageFrame.fillRect(sx + i * cell - line / 2, sy, line, S);
      this.stageFrame.fillRect(sx, sy + i * cell - line / 2, S, line);
    }
    if (this.mini instanceof PaintGame) this.mini.layoutPalette();
    this.reveal?.setData('relayout', true);
    if (this.view === 'reveal' && this.reveal) this.layoutReveal();
  }

  /** Stage-local unit coords for a pointer. */
  private toUnit(p: Phaser.Input.Pointer): { u: number; v: number; inside: boolean } {
    const m = this.stage.getWorldTransformMatrix();
    const l = m.applyInverse(p.x, p.y);
    const u = l.x / STAGE;
    const v = l.y / STAGE;
    return { u, v, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (!this.mini || this.stepLocked || this.hasModal() || session.paused) return;
    if (
      over.some(
        (o) =>
          o.parentContainer &&
          o.parentContainer !== this.stage &&
          o.parentContainer.parentContainer !== this.stage,
      )
    )
      return;
    const { u, v, inside } = this.toUnit(p);
    if (!inside) return;
    this.down = true;
    this.lastMove = performance.now();
    this.mini.pointerDown(u, v);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.mini || this.stepLocked) return;
    const { u, v } = this.toUnit(p);
    const now = performance.now();
    const dt = Math.max(0.001, (now - this.lastMove) / 1000);
    this.lastMove = now;
    this.mini.pointerMove(
      Math.max(0, Math.min(1, u)),
      Math.max(0, Math.min(1, v)),
      this.down && p.isDown,
      dt,
    );
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.mini || !this.down) return;
    this.down = false;
    const { u, v } = this.toUnit(p);
    this.mini.pointerUp(u, v);
  }

  override update(_time: number, delta: number): void {
    if (!this.mini || this.stepLocked) return;
    this.mini.update(delta / 1000);
    const p = this.mini.progress();
    this.bar.setValue(p);
    this.doneBtn.setEnabled(p >= this.mini.minProgressForDone());
    const instr = t(this.mini.instruction());
    if (this.instruction.text !== instr) this.instruction.setText(instr);
    if (this.mini.autoComplete()) this.completeStep();
  }

  // ---------------- item flow ----------------

  private nextItem(): void {
    const s = session.state;
    this.cleanupItem();
    if (this.dailyKey) {
      if (this.dailyDone) {
        this.scene.start('Daily');
        return;
      }
      this.itemNo = 1;
      this.inst = dailyItem(this.dailyKey);
      this.startItem(this.inst);
      return;
    }
    const queue = workshopQueue(s);
    if (!queue.length) {
      this.allDone();
      return;
    }
    this.itemNo++;
    this.inst = queue[0];
    this.startItem(this.inst);
  }

  private startItem(inst: ItemInstance): void {
    const s = session.state;
    this.view = 'steps';
    inst.sc = recipeFor(inst).map(() => null);
    this.recipe = recipeFor(inst);
    this.stepIdx = 0;
    this.paintChoice = null;
    this.key = `ws_${inst.uid}_${Date.now() % 100000}`;
    const px = this.stageSize * this.frame.scale;
    this.texSize = Math.max(384, Math.min(1024, Math.ceil(px / 64) * 64));
    const set = buildDamage(inst, this.texSize);
    this.set = set;
    // before snapshot for the reveal
    this.textures.addCanvas(`${this.key}_before`, compositeDamaged(set));
    this.textures.addCanvas(`${this.key}_base`, set.base);
    const base = this.add.image(0, 0, `${this.key}_base`).setOrigin(0, 0).setDisplaySize(STAGE, STAGE);
    this.stage.add(base);
    if (set.crack) {
      this.textures.addCanvas(`${this.key}_crack`, crackCanvas(set.layerSize, set.crack, set.sil));
      const img = this.add.image(0, 0, `${this.key}_crack`).setOrigin(0, 0).setDisplaySize(STAGE, STAGE);
      this.stage.add(img);
      this.crackG = null;
      img.setName('crack');
    }
    for (const k of LAYER_ORDER) {
      const layer = set.layers[k];
      if (!layer) continue;
      this.textures.addCanvas(`${this.key}_${k}`, layer);
      const img = this.add.image(0, 0, `${this.key}_${k}`).setOrigin(0, 0).setDisplaySize(STAGE, STAGE);
      this.stage.add(img);
      this.layerImages[k] = img;
    }
    if (set.sticker) {
      // The sticker game draws its own sticker image; nothing to add up-front besides it.
    }
    this.counter.setText(
      `${inst.job ? `${t('jobs.badge')}: ` : ''}${ITEMS[inst.a].name} · ${t('mg.itemOf', { n: this.itemNo, total: this.itemTotal })}`,
    );
    this.renderChips();
    const canGold =
      !this.dailyKey &&
      session.platform.capabilities.rewardedAds &&
      !s.day.premiumOnce &&
      !hasPerk(s, 'golden_toolkit') &&
      s.flags.tutorialDone;
    this.goldBtn.setVisible(canGold);
    // Pop-in: animate a factor and always read the *current* stage size, so a layout pass
    // (first build or a resize mid-animation) can never be overwritten by a stale target scale.
    this.stage.setAlpha(0);
    const pop = { f: 0.9 };
    this.tweens.add({
      targets: pop,
      f: 1,
      duration: 260,
      ease: 'Back.out',
      onUpdate: () => {
        this.stage.setScale((this.stageSize / STAGE) * pop.f);
        this.stage.setAlpha(Math.min(1, (pop.f - 0.9) * 10));
      },
      onComplete: () => {
        this.stage.setScale(this.stageSize / STAGE);
        this.stage.setAlpha(1);
      },
    });
    session.audio.play('whoosh');
    this.nextStep();
  }

  private renderChips(): void {
    this.chips.removeAll(true);
    const n = this.recipe.length;
    const gap = 112;
    const x0 = -((n - 1) * gap) / 2;
    this.recipe.forEach((st, i) => {
      const c = this.add.container(x0 + i * gap, 0);
      const g = this.add.graphics();
      const state = i < this.stepIdx ? 'done' : i === this.stepIdx ? 'now' : 'todo';
      const fill = state === 'done' ? 0xdff2d5 : state === 'now' ? C.white : 0xf3ece2;
      drawCard(g, -50, -38, 100, 76, fill, {
        radius: 18,
        stroke: state === 'now' ? C.terracotta : C.ink,
        strokeW: state === 'now' ? 6 : 3,
        shadow: 3,
      });
      const ic = this.add.graphics();
      drawStepIcon(ic, st.k, 40);
      ic.setPosition(0, -8);
      const lb = makeText(
        this,
        0,
        24,
        st.req ? t(`step.${st.k}`) : `+ ${t(`step.${st.k}`)}`,
        FS.tiny - 4,
        st.req ? C.ink : C.leafDark,
      );
      if (lb.width > 94) lb.setScale(94 / lb.width);
      c.add([g, ic, lb]);
      if (state === 'done') {
        const sc = this.inst?.sc[i];
        const ok = makeText(
          this,
          34,
          -30,
          sc === null || sc === undefined ? '–' : '✓',
          FS.small,
          C.leafDark,
          { stroke: C.white, strokeW: 4 },
        );
        c.add(ok);
      }
      this.chips.add(c);
    });
    const maxW = this.frame.portrait ? this.frame.w - 40 : this.frame.w - this.stageSize - 120;
    const total = n * gap;
    this.chips.setScale(Math.min(1, maxW / total));
  }

  private nextStep(): void {
    this.destroyGame();
    if (!this.inst) return;
    if (this.stepIdx >= this.recipe.length) {
      this.finishItem();
      return;
    }
    this.renderChips();
    const st = this.recipe[this.stepIdx];
    this.bar.setValue(0);
    // Bonus steps start straight away like any other step; Skip sits next to Done.
    this.startGame();
    if (!st.req) {
      this.toast(t('mg.optional', { step: t(`step.${st.k}`) }), C.leafDark);
    }
  }

  private startGame(): void {
    if (!this.inst || !this.set) return;
    const s = session.state;
    const st = this.recipe[this.stepIdx];
    this.skipBtn.setVisible(!st.req && s.flags.tutorialDone);
    this.doneBtn.setVisible(true);
    this.bar.setVisible(true);
    this.goldBtn.setVisible(false);
    const ctx: MiniCtx = {
      scene: this,
      stage: this.stage,
      set: this.set,
      tex: this.set.layerSize,
      tools: toolParams(s, !this.dailyKey && s.day.premiumOnce),
      inst: this.inst,
      kind: st.k,
      layerImages: this.layerImages,
      key: this.key,
      trendColor: trendColor(s),
      cbPalette: s.settings.cbPalette,
      panel: this.panel,
      relayout: () => this.layout(),
    };
    switch (st.k) {
      case 'scrub':
      case 'rust':
      case 'sand':
      case 'polish':
        this.mini = new EraseGame(ctx, st.k);
        break;
      case 'sticker':
        this.mini = new StickerGame(ctx);
        break;
      case 'glue':
        this.mini = new GlueGame(ctx);
        break;
      case 'paint':
        this.mini = new PaintGame(ctx);
        break;
      case 'wire':
        this.mini = new RepairGame(ctx, 'wire');
        break;
      case 'fix':
        this.mini = new RepairGame(ctx, 'fix');
        break;
      case 'design':
        this.mini = new DesignGame(ctx);
        break;
    }
    this.mini!.start();
    this.instruction.setText(t(this.mini!.instruction()));
    this.stepLocked = false;
    if (this.coach) {
      const key = st.k === 'scrub' ? 'tut.scrub' : st.k === 'polish' ? 'tut.polish' : null;
      if (key) this.coach.say(t(key), { at: this.frame.portrait ? 'bottom' : 'right', mood: 'happy' });
      if (key)
        this.coach.pointAt({ x: this.stage.x + this.stageSize / 2, y: this.stage.y + this.stageSize / 2 });
    }
  }

  private completeStep(): void {
    if (!this.mini || !this.inst || this.stepLocked) return;
    this.stepLocked = true;
    const score = this.mini.score();
    recordStep(this.inst, this.stepIdx, score);
    if (this.mini instanceof PaintGame && this.mini.chosenColor() && score >= 0.4)
      this.paintChoice = this.mini.chosenColor();
    this.mini.finishVisuals();
    if (this.stepIdx < this.recipe.length && this.recipe[this.stepIdx].k === 'glue') {
      const crack = this.stage.getByName('crack') as Phaser.GameObjects.Image | null;
      if (crack) this.tweens.add({ targets: crack, alpha: 0, duration: 300 });
    }
    session.audio.play('ding');
    session.haptic('success');
    this.coach?.hide();
    this.showStepStars(score);
    this.doneBtn.setVisible(false);
    this.time.delayedCall(900, () => {
      this.stepIdx++;
      this.nextStep();
    });
  }

  private showStepStars(score: number): void {
    const stars = Math.max(1, starsFor(score));
    const cx = this.stage.x + this.stageSize / 2;
    const cy = this.stage.y + this.stageSize / 2;
    const c = this.add.container(cx, cy);
    for (let i = 0; i < 3; i++) {
      const g = this.add.graphics();
      drawStar(g, 0, 0, 40, i < stars ? C.gold : 0xd9d0c4);
      g.setPosition((i - 1) * 96, i === 1 ? -20 : 0);
      g.setScale(0);
      c.add(g);
      this.tweens.add({ targets: g, scale: 1, delay: i * 110, duration: 260, ease: 'Back.out' });
    }
    const word = [t('mg.ok'), t('mg.ok'), t('mg.great'), t('mg.perfect')][stars];
    const tx = makeText(this, 0, 70, word, FS.h2, C.white, { stroke: C.ink, strokeW: 8 });
    c.add(tx);
    this.root.add(c);
    this.sparkle(cx, cy, 16);
    this.tweens.add({ targets: c, alpha: 0, delay: 750, duration: 200, onComplete: () => c.destroy() });
  }

  private skipStep(): void {
    if (!this.inst) return;
    recordStep(this.inst, this.stepIdx, null);
    session.audio.play('pop');
    this.stepIdx++;
    this.nextStep();
  }

  private async useGolden(): Promise<void> {
    if (await this.rewarded(REWARD_IDS.premiumTool)) {
      session.state.day.premiumOnce = true;
      this.goldBtn.setVisible(false);
      session.audio.play('sparkle');
      this.toast(t('mg.goldenOn'), C.mustardDark);
      if (this.mini) {
        // Restart the current step with golden tools.
        this.destroyGame();
        this.startGame();
      }
    }
  }

  private finishItem(): void {
    const s = session.state;
    const inst = this.inst!;
    if (this.dailyKey) {
      if (this.paintChoice) inst.col = this.paintChoice;
      inst.q = qualityOf(inst);
      const stars = starsFor(inst.q);
      const out = recordDaily(s, this.dailyKey, stars);
      this.dailyDone = true;
      this.dailyResult = { stars, reward: out.reward };
      void session.save(true);
      this.showReveal({
        quality: inst.q,
        value: instanceValue(s, inst),
        stars,
        newPerfect: false,
        gemRevealed: false,
        xp: 0,
        levelUps: 0,
        setCompleted: null,
      });
      return;
    }
    const res = finishRestoration(s, inst, this.paintChoice ?? undefined);
    s.day.premiumOnce = false;
    // A customer's job: they collect it and pay (it never goes on our shelves).
    const job = inst.job ? completeJob(s, inst) : null;
    if (job) res.levelUps += job.levelUps;
    void session.save();
    this.showReveal(res, job);
  }

  // ---------------- reveal ----------------

  private showReveal(res: RestoreResult, job: JobResult | null = null): void {
    const inst = this.inst!;
    this.view = 'reveal';
    this.doneBtn.setVisible(false);
    this.skipBtn.setVisible(false);
    this.goldBtn.setVisible(false);
    this.bar.setVisible(false);
    this.chips.setVisible(false);
    this.panel.setVisible(false);
    this.instruction.setText(t('reveal.title'));
    const after = makeCanvas(this.texSize);
    drawItem(ctx2d(after), ITEMS[inst.a], boxFor(this.texSize), { paint: inst.col });
    this.textures.addCanvas(`${this.key}_after`, after);
    for (const o of [...this.stage.list]) (o as Phaser.GameObjects.GameObject).destroy();
    this.layerImages = {};
    const r = this.add.container(0, 0);
    this.reveal = r;
    const afterImg = this.add.image(0, 0, `${this.key}_after`).setOrigin(0, 0).setDisplaySize(STAGE, STAGE);
    const beforeImg = this.add.image(0, 0, `${this.key}_before`).setOrigin(0, 0).setDisplaySize(STAGE, STAGE);
    const divider = this.add.graphics();
    const lblB = makeText(this, 70, 30, t('reveal.before'), FS.small, C.white, { stroke: C.ink, strokeW: 5 });
    const lblA = makeText(this, STAGE - 70, 30, t('reveal.after'), FS.small, C.white, {
      stroke: C.ink,
      strokeW: 5,
    });
    this.stage.add([afterImg, beforeImg, divider, lblB, lblA]);
    const setSplit = (f: number) => {
      // The item may already be gone (Next pressed mid-sweep): never touch destroyed objects.
      if (!beforeImg.active || !divider.active || !beforeImg.frame?.texture) return;
      const tw = this.texSize;
      beforeImg.setCrop(0, 0, Math.max(0, f * tw), tw);
      divider.clear();
      const x = f * STAGE;
      divider.fillStyle(C.white, 1);
      divider.fillRect(x - 4, 0, 8, STAGE);
      divider.lineStyle(3, C.ink, 1);
      divider.strokeRect(x - 4, 0, 8, STAGE);
      divider.fillStyle(C.mustard, 1);
      divider.fillCircle(x, STAGE / 2, 30);
      divider.strokeCircle(x, STAGE / 2, 30);
      divider.fillStyle(C.ink, 1);
      divider.fillTriangle(x - 20, STAGE / 2, x - 8, STAGE / 2 - 10, x - 8, STAGE / 2 + 10);
      divider.fillTriangle(x + 20, STAGE / 2, x + 8, STAGE / 2 - 10, x + 8, STAGE / 2 + 10);
    };
    const split = { f: 1 };
    this.revealSplit = split;
    setSplit(1);
    // Auto sweep for a satisfying, clip-able reveal.
    this.revealSweep = this.tweens.chain({
      tweens: [
        {
          targets: split,
          f: 0,
          duration: 1100,
          ease: 'Sine.inOut',
          delay: 250,
          onUpdate: () => setSplit(split.f),
        },
        { targets: split, f: 0.5, duration: 600, ease: 'Sine.out', onUpdate: () => setSplit(split.f) },
      ],
    });
    session.audio.play('sparkle');
    // Drag to compare.
    const zone = this.add.zone(STAGE / 2, STAGE / 2, STAGE, STAGE).setInteractive({ draggable: false });
    this.stage.add(zone);
    const dragTo = (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const { u } = this.toUnit(p);
      split.f = Math.max(0, Math.min(1, u));
      setSplit(split.f);
    };
    zone.on('pointerdown', dragTo);
    zone.on('pointermove', dragTo);
    // Value pop-up card.
    const card = this.add.container(0, 0);
    const bg = this.add.graphics();
    drawCard(bg, -300, -150, 600, 300, C.paper, { radius: 30, stroke: C.ink, strokeW: 5, shadow: 8 });
    card.add(bg);
    for (let i = 0; i < 3; i++) {
      const g = this.add.graphics();
      drawStar(g, (i - 1) * 74, -100, 32, i < Math.max(1, res.stars) ? C.gold : 0xd9d0c4);
      card.add(g);
    }
    const line = makeText(
      this,
      0,
      -30,
      this.dailyKey
        ? t('daily.result', { stars: res.stars })
        : job && inst.job
          ? t('jobs.paid', { name: inst.job.c || persona(inst.job.p).name, n: job.fee })
          : t('reveal.flip', { paid: inst.paid, value: res.value }),
      FS.h3,
      C.ink,
      { wrap: 560 },
    );
    card.add(line);
    let extra = '';
    if (job)
      extra = job.missed
        ? t('jobs.missed', { stars: '★'.repeat(inst.job?.t ?? 1) })
        : job.tip > 0
          ? t('jobs.tip', { n: job.tip })
          : '';
    else if (res.gemRevealed) extra = t('reveal.gem');
    else if (res.newPerfect) extra = t('reveal.perfect');
    else if (inst.r > 0) extra = `${'★'.repeat(inst.r)} ${rarityLabel(inst.r)}`;
    if (extra)
      card.add(
        makeText(
          this,
          0,
          30,
          extra,
          FS.body,
          job
            ? job.missed
              ? C.terracottaDark
              : C.leafDark
            : res.gemRevealed
              ? C.purple
              : RARITY_COLORS[Math.max(1, inst.r)],
          { stroke: C.white, strokeW: 4 },
        ),
      );
    const queueLeft = this.dailyKey ? 0 : workshopQueue(session.state).length;
    const next = new Button(this, 0, 100, {
      w: 320,
      h: 80,
      label: this.dailyKey
        ? t('common.done')
        : queueLeft
          ? t('reveal.next')
          : isReselling(session.state)
            ? t('reveal.toShop')
            : t('reveal.endDay'),
      color: C.terracotta,
      fontSize: FS.h3,
      icon: (g, sz) => iconArrow(g, sz),
      onClick: () => (queueLeft ? this.nextItem() : this.allDone()),
    });
    card.add(this.mark('next', next));
    r.add(card);
    this.root.add(r);
    card.setScale(0);
    this.tweens.add({
      targets: card,
      scale: 1,
      delay: 1500,
      duration: 380,
      ease: 'Back.out',
      onStart: () => {
        session.audio.play(res.gemRevealed ? 'gem' : 'coin');
        if (res.gemRevealed) this.sparkle(card.x, card.y - 100, 60, C.purple);
        else this.sparkle(card.x, card.y - 100, 24);
      },
    });
    this.layoutReveal();
    if (this.coach) {
      this.time.delayedCall(1900, () =>
        this.coach?.say(t('tut.reveal'), { at: this.frame.portrait ? 'top' : 'right', mood: 'wow' }),
      );
    }
    if (res.setCompleted)
      this.time.delayedCall(2200, () =>
        this.toast(t('catalog.setDone', { cat: t(`cat.${res.setCompleted}`) }), C.purple),
      );
    if (res.levelUps > 0) this.time.delayedCall(2600, () => this.celebrateLevel(res.levelUps));
    this.refreshHud();
  }

  private layoutReveal(): void {
    if (!this.reveal) return;
    const f = this.frame;
    const card = this.reveal.list[0] as Phaser.GameObjects.Container;
    if (f.portrait) {
      card.setPosition(f.w / 2, Math.min(f.h - 190, this.stage.y + this.stageSize + 170));
      card.setScale(Math.min(1, (f.w - 40) / 600));
    } else {
      card.setPosition((this.stage.x + this.stageSize + f.w) / 2 + 10, f.h / 2 + 40);
      card.setScale(Math.min(1, (f.w - this.stageSize - 100) / 600));
    }
  }

  private allDone(): void {
    const s = session.state;
    if (this.dailyKey) {
      this.scene.start('Daily', { result: this.dailyResult });
      return;
    }
    advancePhase(s, 'shop');
    if (!isReselling(s)) {
      // A repair business has no shop floor: the customers already paid, on to the summary.
      advancePhase(s, 'summary');
      void session.save(true);
      this.scene.start('Summary');
      return;
    }
    void session.save(true);
    this.scene.start('Shop');
  }

  /** E2E: what the current step needs, in device pixels. */
  debugInfo(): Record<string, unknown> {
    const m = this.stage.getWorldTransformMatrix();
    const size = STAGE * m.scaleX;
    const st = this.recipe[this.stepIdx];
    const info: Record<string, unknown> = {
      view: this.view,
      kind: this.mini ? st?.k : null,
      pendingOptional: false,
      progress: this.mini ? this.mini.progress() : 0,
      stage: { x: m.tx, y: m.ty, size },
      step: this.stepIdx,
      steps: this.recipe.map((r) => r.k),
      locked: this.stepLocked,
    };
    if (this.set?.crack) info.path = this.set.crack;
    if (this.set?.sticker) {
      const sk = this.set.sticker;
      const cos = Math.cos(sk.rot);
      const sin = Math.sin(sk.rot);
      const lx = (sk.cx * sk.w) / 2;
      const ly = (sk.cy * sk.h) / 2;
      info.sticker = {
        corner: { u: sk.x + lx * cos - ly * sin, v: sk.y + lx * sin + ly * cos },
        dir: -sk.cx,
        w: sk.w,
      };
    }
    if (this.mini instanceof RepairGame || this.mini instanceof DesignGame) info.repair = this.mini.debug();
    return info;
  }

  // ---------------- cleanup ----------------

  private destroyGame(): void {
    if (this.mini) {
      this.mini.destroy();
      this.mini = null;
    }
    this.panel.removeAll(true);
    this.stepLocked = false;
  }

  private cleanupItem(): void {
    this.revealSweep?.destroy();
    this.revealSweep = null;
    if (this.revealSplit) {
      this.tweens.killTweensOf(this.revealSplit);
      this.revealSplit = null;
    }
    this.destroyGame();
    this.reveal?.destroy();
    this.reveal = null;
    if (this.stage) for (const o of [...this.stage.list]) (o as Phaser.GameObjects.GameObject).destroy();
    this.layerImages = {};
    this.crackG = null;
    this.stickerImg = null;
    this.chips?.setVisible(true);
    this.panel?.setVisible(true);
    if (this.key) {
      for (const suffix of [
        'before',
        'base',
        'after',
        'crack',
        'sticker',
        'paintIn',
        'paintOut',
        ...LAYER_ORDER,
      ]) {
        const k = `${this.key}_${suffix}`;
        if (!this.textures.exists(k)) continue;
        const src = this.textures.get(k).getSourceImage();
        this.textures.remove(k);
        // Free pixel memory now: iOS refuses new canvases once too many are waiting for GC.
        if (src instanceof HTMLCanvasElement) releaseCanvas(src);
      }
    }
    if (this.set) releaseDamage(this.set);
    this.key = '';
  }
}
