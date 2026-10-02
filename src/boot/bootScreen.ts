/** The HTML loading screen shown before the engine chunk is downloaded. */
export function setBootProgress(pct: number, label?: string): void {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const fill = document.getElementById('boot-fill');
  const lbl = document.getElementById('boot-label');
  const root = document.getElementById('boot');
  if (fill) fill.style.width = `${p}%`;
  if (lbl) lbl.textContent = label ?? `Loading ${p}%`;
  if (root) root.setAttribute('aria-valuenow', String(p));
}

export function hideBootScreen(): void {
  const root = document.getElementById('boot');
  if (!root) return;
  root.style.opacity = '0';
  root.style.pointerEvents = 'none';
  setTimeout(() => root.remove(), 400);
}

/** Resolves once the browser has actually painted the current DOM (two rAFs). */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
