// Keyboard + touch input layer.
//
// Mirrors the DOS INT 16h AH=0 (read key) / AH=1 (peek key) model:
// keys land in a FIFO; `pollKey()` returns the next one or null.
// Each entry is { key, code } using DOM KeyboardEvent fields, plus
// the rough ASCII char if available.

export class InputQueue {
  constructor() {
    this.q = [];
    this.handlers = [];
  }

  push(ev) {
    const entry = {
      key: ev.key,
      code: ev.code,
      ascii: ev.key.length === 1 ? ev.key : null,
    };
    this.q.push(entry);
    for (const h of this.handlers) h(entry);
  }

  pollKey() { return this.q.shift() ?? null; }
  hasKey() { return this.q.length > 0; }
  onKey(fn) { this.handlers.push(fn); }
}

export function attachInput(input, canvas, touchpad) {
  canvas.tabIndex = 0;
  canvas.addEventListener('click', () => canvas.focus());

  // Capture focus state for bezel glow.
  const bezel = canvas.closest('.bezel');
  canvas.addEventListener('focus', () => bezel?.classList.add('focused'));
  canvas.addEventListener('blur',  () => bezel?.classList.remove('focused'));

  window.addEventListener('keydown', (e) => {
    if (document.activeElement !== canvas) return;
    // Don't trap modifiers we don't use, but eat plain keys so the page
    // doesn't scroll.
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter','Escape','PageUp','PageDown','Home','End'].includes(e.key)) {
      e.preventDefault();
    }
    input.push(e);
  });

  canvas.addEventListener('wheel', (e) => {
    if (document.activeElement !== canvas) return;
    e.preventDefault();
    input.push({
      key: e.deltaY < 0 ? 'PageUp' : 'PageDown',
      code: e.deltaY < 0 ? 'PageUp' : 'PageDown',
    });
  }, { passive: false });

  // Touchpad buttons synthesize keydown events.
  if (touchpad) {
    touchpad.querySelectorAll('button[data-key]').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const key = btn.dataset.key;
        const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
        input.push({ key, code });
        canvas.focus();
      });
    });
  }
}
