import Phaser from 'phaser';
import { BaseScene } from './BaseScene';
import { Button, drawCard, makeText } from '../ui/widgets';
import { C, FS } from '../theme';
import { session } from '../session';
import {
  NAME_MAX,
  NAME_WORDS,
  checkName,
  cleanName,
  nameFromParts,
  randomParts,
  type NameParts,
} from '../../core/names';
import { t } from '../../i18n';

const ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/**
 * Name your company: spin three word wheels ("Sparkle" "Fix" "Co.") or type a name on the in-game
 * keyboard (no browser text box, so it works the same everywhere). Typed names go through a word
 * filter. The name then shows on the shop sign, summaries and contracts.
 */
export class NameScene extends BaseScene {
  private panel!: Phaser.GameObjects.Container;
  private sign!: Phaser.GameObjects.Text;
  private note!: Phaser.GameObjects.Text;
  private builder!: Phaser.GameObjects.Container;
  private keyboard!: Phaser.GameObjects.Container;
  private wheelTexts: Phaser.GameObjects.Text[] = [];
  private parts: NameParts = [0, 0, 0];
  private typed = '';
  private mode: 'words' | 'type' = 'words';
  private next = 'Market';
  private seedN = 0;

  constructor() {
    super('Name');
  }

  protected build(data?: unknown): void {
    const d = (data ?? {}) as { next?: string };
    this.next = d.next ?? 'Market';
    this.wheelTexts = [];
    this.mode = 'words';
    this.bgColors = { base: 0xfff1d6, dots: 0xffe1a8 };
    const s = session.state;
    this.seedN = s.seed;
    this.parts = this.partsFor(s.company) ?? randomParts(s.seed);
    this.typed = '';
    this.panel = this.add.container(0, 0);
    const bg = this.add.graphics();
    drawCard(bg, -340, -470, 680, 940, C.paper, { radius: 34, stroke: C.ink, strokeW: 6, shadow: 10 });
    this.panel.add(bg);
    this.panel.add(
      makeText(this, 0, -410, t('name.title'), FS.h2, C.terracotta, { stroke: C.ink, strokeW: 6, wrap: 620 }),
    );
    this.panel.add(makeText(this, 0, -345, t('name.sub'), FS.small, C.inkSoft, { wrap: 600, bold: false }));
    // The shop sign with the name on it.
    const sign = this.add.graphics();
    drawCard(sign, -300, -300, 600, 110, C.teal, { radius: 22, stroke: C.ink, strokeW: 5, shadow: 6 });
    this.sign = makeText(this, 0, -245, '', FS.h3, C.white, { stroke: C.ink, strokeW: 6 });
    this.note = makeText(this, 0, -162, '', FS.tiny, C.terracottaDark, { wrap: 600 });
    this.panel.add([sign, this.sign, this.note]);
    this.builder = this.buildWords();
    this.keyboard = this.buildKeyboard();
    this.panel.add([this.builder, this.keyboard]);
    const ok = new Button(this, 0, 400, {
      w: 360,
      h: 92,
      label: t('name.ok'),
      color: C.leaf,
      fontSize: FS.h3,
      onClick: () => this.confirm(),
    });
    this.panel.add(this.mark('nameOk', ok));
    this.root.add(this.panel);
    this.input.keyboard?.on('keydown', this.onTypeKey, this);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this.onTypeKey, this));
    this.setMode('words');
  }

  /** Word indices of a name made from the lists, if it is one. */
  private partsFor(name: string): NameParts | null {
    const w = NAME_WORDS;
    for (let a = 0; a < w.first.length; a++)
      for (let b = 0; b < w.second.length; b++)
        for (let c = 0; c < w.suffix.length; c++) if (nameFromParts([a, b, c]) === name) return [a, b, c];
    return null;
  }

  private buildWords(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const lists = [NAME_WORDS.first, NAME_WORDS.second, NAME_WORDS.suffix];
    lists.forEach((_, i) => {
      const y = -70 + i * 104;
      const box = this.add.graphics();
      drawCard(box, -170, y - 40, 340, 80, C.white, { radius: 18, stroke: C.ink, strokeW: 3, shadow: 3 });
      const txt = makeText(this, 0, y, '', FS.h3, C.ink);
      this.wheelTexts.push(txt);
      const spin = (dir: number) => {
        this.parts[i] += dir;
        session.audio.play('tick');
        this.refresh();
      };
      const prev = new Button(this, -230, y, {
        w: 84,
        h: 76,
        label: '◀',
        color: C.mustard,
        onClick: () => spin(-1),
      });
      const next = new Button(this, 230, y, {
        w: 84,
        h: 76,
        label: '▶',
        color: C.mustard,
        onClick: () => spin(1),
      });
      this.mark(`wheel${i}next`, next);
      c.add([box, txt, prev, next]);
    });
    const shuffle = new Button(this, -150, 260, {
      w: 260,
      h: 76,
      label: t('name.shuffle'),
      color: C.purple,
      fontSize: FS.small,
      onClick: () => {
        this.seedN = (this.seedN * 1103515245 + 12345) >>> 0;
        this.parts = randomParts(this.seedN);
        session.audio.play('whoosh');
        this.refresh();
      },
    });
    const type = new Button(this, 150, 260, {
      w: 260,
      h: 76,
      label: t('name.type'),
      color: C.sky,
      fontSize: FS.small,
      onClick: () => this.setMode('type'),
    });
    c.add([this.mark('nameShuffle', shuffle), this.mark('nameType', type)]);
    return c;
  }

  private buildKeyboard(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const key = 58;
    const gap = 6;
    ROWS.forEach((row, r) => {
      const y = -96 + r * (key + gap + 6);
      const w = row.length * (key + gap) - gap;
      row.split('').forEach((ch, i) => {
        const b = new Button(this, -w / 2 + key / 2 + i * (key + gap), y, {
          w: key,
          h: key + 6,
          label: ch,
          color: C.white,
          textColor: C.ink,
          fontSize: FS.small,
          sfx: false,
          onClick: () => this.typeChar(ch),
        });
        this.mark(`key_${ch}`, b);
        c.add(b);
      });
    });
    const y = -96 + 4 * (key + gap + 6);
    const space = new Button(this, -120, y, {
      w: 250,
      h: key + 6,
      label: t('name.space'),
      color: C.white,
      textColor: C.ink,
      fontSize: FS.small,
      onClick: () => this.typeChar(' '),
    });
    const del = new Button(this, 100, y, {
      w: 120,
      h: key + 6,
      label: '⌫',
      color: C.mustard,
      fontSize: FS.h3,
      onClick: () => this.backspace(),
    });
    const amp = new Button(this, 205, y, {
      w: 70,
      h: key + 6,
      label: '&',
      color: C.white,
      textColor: C.ink,
      fontSize: FS.small,
      onClick: () => this.typeChar('&'),
    });
    const words = new Button(this, 0, 290, {
      w: 300,
      h: 70,
      label: t('name.words'),
      color: C.purple,
      fontSize: FS.small,
      onClick: () => this.setMode('words'),
    });
    c.add([space, del, amp, this.mark('nameWords', words)]);
    this.mark('key_space', space);
    this.mark('key_del', del);
    return c;
  }

  private setMode(m: 'words' | 'type'): void {
    this.mode = m;
    if (m === 'type' && !this.typed) this.typed = '';
    this.builder.setVisible(m === 'words');
    this.keyboard.setVisible(m === 'type');
    this.note.setText('');
    this.refresh();
  }

  /** Each word starts with a capital, the rest is lower case (so names look tidy). */
  private typeChar(ch: string): void {
    if (this.typed.length >= NAME_MAX) return;
    const prev = this.typed[this.typed.length - 1];
    const startOfWord = !prev || prev === ' ';
    const c = /[A-Z]/.test(ch) ? (startOfWord ? ch : ch.toLowerCase()) : ch;
    this.typed = cleanName(this.typed + c);
    this.uiSfx('tick');
    this.note.setText('');
    this.refresh();
  }

  private backspace(): void {
    this.typed = this.typed.slice(0, -1);
    this.uiSfx('tick');
    this.refresh();
  }

  private onTypeKey(e: KeyboardEvent): void {
    if (this.mode !== 'type' || this.hasModal()) return;
    if (e.key === 'Backspace') this.backspace();
    else if (e.key === 'Enter') this.confirm();
    else if (e.key.length === 1 && /[A-Za-z0-9 &]/.test(e.key)) this.typeChar(e.key.toUpperCase());
  }

  private current(): string {
    return this.mode === 'words' ? nameFromParts(this.parts) : this.typed;
  }

  private refresh(): void {
    const lists = [NAME_WORDS.first, NAME_WORDS.second, NAME_WORDS.suffix];
    this.wheelTexts.forEach((tx, i) => {
      const l = lists[i];
      tx.setText(l[((this.parts[i] % l.length) + l.length) % l.length]);
    });
    const name = this.current();
    this.sign.setText(name || '…');
    this.sign.setScale(1);
    if (this.sign.width > 560) this.sign.setScale(560 / this.sign.width);
  }

  private confirm(): void {
    const s = session.state;
    const name = cleanName(this.current()).trim();
    const check = checkName(name);
    if (check !== 'ok') {
      // Never show the rejected word back: just ask for another and offer a word-wheel name.
      this.note.setText(check === 'short' ? t('name.short') : t('name.blocked'));
      session.audio.play('buzz');
      if (check === 'blocked') {
        this.typed = '';
        this.refresh();
      }
      return;
    }
    s.company = name;
    s.flags.named = true;
    void session.save(true);
    session.audio.play('levelup');
    this.scene.start(this.next);
  }

  protected layout(): void {
    if (!this.panel) return;
    const f = this.frame;
    const sc = Math.min(1, (f.h - 30) / 960, (f.w - 24) / 700);
    this.panel.setScale(sc);
    this.panel.setPosition(f.w / 2, f.h / 2);
  }
}
