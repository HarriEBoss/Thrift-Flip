import type Phaser from 'phaser';
import { ITEMS } from '../../core/data';
import type { ItemInstance } from '../../core/state';
import { boxFor, ctx2d, drawItem, makeCanvas, releaseCanvas } from './itemArt';
import { thumbnailCanvas } from './damage';

/** Small LRU of generated textures so scenes can share thumbnails without leaking GPU memory. */
const order: string[] = [];
const MAX = 90;

export function canvasToTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): string {
  const tm = scene.textures;
  if (tm.exists(key)) {
    touch(key);
    return key;
  }
  tm.addCanvas(key, canvas);
  touch(key);
  while (order.length > MAX) {
    const old = order.shift()!;
    if (tm.exists(old) && !isInUse(scene, old)) {
      const src = tm.get(old).getSourceImage();
      tm.remove(old);
      if (src instanceof HTMLCanvasElement) releaseCanvas(src);
    }
  }
  return key;
}

function touch(key: string): void {
  const i = order.indexOf(key);
  if (i >= 0) order.splice(i, 1);
  order.push(key);
}

/** True when any object in the scene (including inside containers) still shows this texture. */
function isInUse(scene: Phaser.Scene, key: string): boolean {
  const walk = (list: Phaser.GameObjects.GameObject[]): boolean =>
    list.some((o) => {
      if ((o as Phaser.GameObjects.Image).texture?.key === key) return true;
      const children = (o as Phaser.GameObjects.Container).list;
      return Array.isArray(children) && walk(children as Phaser.GameObjects.GameObject[]);
    });
  return walk(scene.children.list);
}

export const THUMB = 256;

/** Texture for an item instance in its current state (dirty or restored). */
export function instanceThumb(scene: Phaser.Scene, inst: ItemInstance, size = THUMB): string {
  const state = inst.q >= 0 ? `r${inst.col}` : 'd';
  const key = `thumb_${inst.a}_${inst.s}_${inst.d}_${state}_${size}`;
  if (scene.textures.exists(key)) {
    touch(key);
    return key;
  }
  return canvasToTexture(scene, key, thumbnailCanvas(inst, size));
}

/** Clean catalog art for an archetype (or a silhouette when not found yet). */
export function archetypeThumb(
  scene: Phaser.Scene,
  a: number,
  size = THUMB,
  mode: 'color' | 'mystery' = 'color',
): string {
  const key = `arch_${a}_${mode}_${size}`;
  if (scene.textures.exists(key)) {
    touch(key);
    return key;
  }
  const c = makeCanvas(size);
  const x = ctx2d(c);
  if (mode === 'mystery') {
    drawItem(x, ITEMS[a], boxFor(size), { mode: 'mask' });
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = 'rgba(61,44,37,0.28)';
    x.fillRect(0, 0, size, size);
  } else drawItem(x, ITEMS[a], boxFor(size));
  return canvasToTexture(scene, key, c);
}
