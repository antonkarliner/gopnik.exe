// GOPNIK web port — boot + state machine.
//
// Confirmed in dosbox-x: title -> name/year prompt -> intro narrative ->
// dialog with Dean -> rules -> difficulty selection -> command REPL.

// Version-tag the imports so browsers re-fetch when we edit modules.
// Bump the version suffix any time you edit a module file.
import { Renderer, makeBuffer, COLS, ROWS, writeAt, clearBuffer } from './render.js?v=51';
import { InputQueue, attachInput } from './input.js?v=51';
import { Rand } from './rng.js?v=51';
import { title } from './states/title.js?v=51';
import { menu  } from './states/menu.js?v=51';
import { intro } from './states/intro.js?v=51';
import { difficulty } from './states/difficulty.js?v=51';
import { play } from './states/play.js?v=51';
import { victory } from './states/victory.js?v=51';

const canvas   = document.getElementById('screen');
const touchpad = document.getElementById('touchpad');
const renderer = new Renderer(canvas);
const input    = new InputQueue();
attachInput(input, canvas, touchpad);

// Save-bar buttons (скачать/загрузить сейв): type the matching REPL command into
// the input queue, but only while in the play state (where the REPL reads it).
const savebar = document.getElementById('savebar');
if (savebar) {
  savebar.querySelectorAll('button[data-cmd]').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      if (current !== 'play') {
        canvas.focus({ preventScroll: true });
        window.scrollTo(scrollX, scrollY);
        return;
      }
      for (const ch of btn.dataset.cmd) input.push({ key: ch, code: `Key${ch.toUpperCase()}` });
      input.push({ key: 'Enter', code: 'Enter' });
      canvas.focus({ preventScroll: true });
      requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
    });
  });
}

const buf = makeBuffer(COLS, ROWS);
const rng = new Rand(((Date.now() & 0xFFFF) << 16) | 1);

const boot = {
  lines: [
    '^7GOPNIK.EXE  ^7v1.02  ^7june/sept 2003 by V.P.U.',
    '',
    '^Aweb port  ^7- reverse-engineered from a 88,656-byte MS-DOS binary',
    '          ^7- no emulator; native HTML5/Canvas',
    '          ^7- ground-truth verified in DOSBox-X',
    '',
    '^Bboot      ^7. text-mode 80x25 renderer        ^Aready',
    '^Bboot      ^7. CGA 16-color palette            ^Aready',
    '^Bboot      ^7. ^N escape parser                ^Aready',
    '^Bboot      ^7. CP866 (Cyrillic) text           ^Aready',
    '^Bboot      ^7. title / intro / class select     ^Aready',
    '^Bboot      ^7. command REPL                    ^Eworking',
    '^Bboot      ^7. fight / market / club / etc     ^6Wip',
    '^Bboot      ^7. localStorage + JSON saves      ^Aready',
    '^Bboot      ^7. RNG (Borland LCG, 0x015A4E35)  ^Aready',
  ],
  ticks: 0,
  enter() { this.ticks = 0; },
  update() {
    this.ticks++;
    if (this.ticks > 110) return 'title';
    return null;
  },
  draw(buf) {
    clearBuffer(buf, 7, 0);
    for (let x = 0; x < COLS; x++) writeAt(buf, x, 0, ' ', 0xF, 1);
    writeAt(buf, 2, 0, ' GOPNIK ', 0xF, 1);

    const visible = Math.min(this.lines.length, (this.ticks / 6) | 0);
    for (let i = 0; i < visible; i++) writeAt(buf, 2, 2 + i, this.lines[i]);

    for (let x = 0; x < COLS; x++) writeAt(buf, x, ROWS - 1, ' ', 0xF, 8);
    writeAt(buf, 2, ROWS - 1, 'F: fullscreen   Click screen first', 0xF, 8);
  },
};

// Re-target title's "next state" to intro (was menu in the placeholder).
const _origTitleUpdate = title.update.bind(title);
title.update = function(input) {
  const next = _origTitleUpdate(input);
  return next === 'menu' ? 'intro' : next;
};

const STATES = { boot, title, intro, difficulty, play, menu, victory };
let current = 'boot';
STATES[current].enter?.();

let lastT = 0;
function loop(t) {
  const dt = t - lastT; lastT = t;
  // Global F = fullscreen — but NOT in states that read typed text, or the
  // 'f' shortcut would swallow the `f` (самопал) command and any name/command
  // containing the letter f.
  const typing = current === 'play' || current === 'difficulty';
  for (let i = 0; i < input.q.length && !typing; i++) {
    const k = input.q[i];
    if (k.key === 'f' || k.key === 'F') {
      const bezel = document.getElementById('bezel');
      if (!document.fullscreenElement) bezel.requestFullscreen?.();
      else document.exitFullscreen?.();
      input.q.splice(i, 1);
      i--;
    }
  }

  const next = STATES[current].update(input);
  if (next && STATES[next]) {
    STATES[current].leave?.();
    current = next;
    STATES[current].enter?.();
  }
  STATES[current].draw(buf);
  renderer.draw(buf);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
canvas.focus();

window.__gopnik = { renderer, buf, input, rng, states: STATES, get current() { return current; } };
