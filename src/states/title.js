// Title screen reconstructed from EXE fragment @ file=0x18D0 (713 bytes,
// CP866-decoded). The original draws an 8-row box-drawing logo "GOPNIK"
// with a windmill arrow that rotates through colors 0..7, then the
// Russian "Press any key" prompt and the V.P.U. credit line.

import { clearBuffer, writeAt, COLS, ROWS } from '../render.js?v=54';

// Each entry: [colorIndex, art-text] -- one row of the logo.
// Color index is the `^N` value preceding the row in the EXE.
const ROWS_ART = [
  [0x0, '┌──── ┌────┐ ┌────┐  │    │  │    │  │    /'],
  [0x1, '│     │    │ │    │  │    │  │    │  │   / '],
  [0x2, '│     │    │ │    │  │    │  │    │  │  /  '],
  [0x3, '│     │    │ │    │  ├────┤  │   /│  │_/   '],
  [0x4, '│     │    │ │    │  │    │  │  / │  │ \\   '],
  [0x5, '│     │    │ │    │  │    │  │ /  │  │  \\  '],
  [0x6, '│     │    │ │    │  │    │  │/   │  │   \\ '],
  [0x7, '│     └────┘ │    │  │    │  │    │  │    \\='],
];

let tick = 0;

export const title = {
  enter() { tick = 0; },

  update(input) {
    tick++;
    while (input.hasKey()) {
      const k = input.pollKey();
      if (k.key !== 'F' && k.key !== 'f') return 'menu';
    }
    return null;
  },

  draw(buf) {
    clearBuffer(buf, 7, 0);

    // The original draws the logo offset from the left; we mirror that.
    const x0 = 16;
    const y0 = 4;
    for (let i = 0; i < ROWS_ART.length; i++) {
      const [col, art] = ROWS_ART[i];
      writeAt(buf, x0, y0 + i, art, col, 0);
    }

    // Credits, from offsets after the logo art in the same fragment.
    const cy = y0 + ROWS_ART.length + 2;
    writeAt(buf, x0, cy,     'Версия 1.025', 0x7, 0);
    writeAt(buf, x0, cy + 1, 'Нажми какую-нибудь кнопку', 0xE, 0);
    writeAt(buf, x0, cy + 3, '2003 year, June, Sept', 0x7, 0);
    writeAt(buf, x0, cy + 4, 'by V.P.U.', 0xA, 0);

    writeAt(buf, 2, ROWS - 2, 'reverse-engineered web port', 0x8, 0);
    writeAt(buf, COLS - 18, ROWS - 2, 'press any key ', 0xF, 0);
  },
};
