import { GLYPHS, CP866_BY_CHAR } from './font_cp866.js?v=37';

// 80x25 text-mode renderer for the GOPNIK web port.
//
// Mirrors the DOS color-text-mode mental model used by the original:
//   - a 80 x 25 grid of cells
//   - each cell is { ch, fg, bg } where fg/bg are 4-bit indices into the
//     standard 16-color CGA palette
//   - blink attribute is ignored for now (the original game doesn't seem
//     to use it; Phase 1 will confirm)
//
// The DOS textmode font was 8x16 (320x200 doubled to 720x400 in 80x25).
// We render onto a 720x400 canvas, one canvas pixel == one VGA pixel.
// CSS scales it up with `image-rendering: pixelated` so the bitmap stays
// crisp at any size.
//
// Glyphs are blitted from the embedded authentic CP866 8x16 VGA font
// (src/font_cp866.js) via per-foreground-color atlases, reproducing the
// exact bitmap the original game showed under Russian DOS. The few
// typographic chars the port adds that CP866 lacks (« » — …) are hand-drawn
// as bitmap primitives (SYNTH_GLYPHS) in the same pixel idiom, so the whole
// screen stays crisp bitmap; the web-font fillText path is now only a
// last-resort safety net for any stray char.

export const COLS = 80;
export const ROWS = 25;
export const CELL_W = 9;   // VGA used 9-wide cells in 720x400 text mode
export const CELL_H = 16;
export const SCREEN_W = COLS * CELL_W; // 720
export const SCREEN_H = ROWS * CELL_H; // 400

// Standard CGA / EGA / VGA 16-color palette.
// (Same as the values DOSBox uses for text mode.)
export const PALETTE = [
  '#000000', // 0  black
  '#0000AA', // 1  blue
  '#00AA00', // 2  green
  '#00AAAA', // 3  cyan
  '#AA0000', // 4  red
  '#AA00AA', // 5  magenta
  '#AA5500', // 6  brown
  '#AAAAAA', // 7  light gray
  '#555555', // 8  dark gray
  '#5555FF', // 9  light blue
  '#55FF55', // A  light green
  '#55FFFF', // B  light cyan
  '#FF5555', // C  light red
  '#FF55FF', // D  light magenta
  '#FFFF55', // E  yellow
  '#FFFFFF', // F  white
];

export function makeBuffer(cols = COLS, rows = ROWS, fg = 7, bg = 0) {
  const cells = new Array(cols * rows);
  for (let i = 0; i < cells.length; i++) cells[i] = { ch: ' ', fg, bg };
  return { cols, rows, cells, dirty: true };
}

export function clearBuffer(buf, fg = 7, bg = 0) {
  for (const c of buf.cells) { c.ch = ' '; c.fg = fg; c.bg = bg; }
  buf.dirty = true;
}

export function setCell(buf, x, y, ch, fg, bg) {
  if (x < 0 || y < 0 || x >= buf.cols || y >= buf.rows) return;
  const c = buf.cells[y * buf.cols + x];
  c.ch = ch; c.fg = fg; c.bg = bg;
  buf.dirty = true;
}

// Write a string starting at (x,y). Supports ^N escapes where N is a
// hex digit (0-F) and switches the *foreground* color for following
// chars.
//
// Verified in dosbox-x against the original game: `^0` is "reset to
// default" (i.e. color 7 = light gray), not literal color 0 (black).
// Colors ^1-^F map directly to CGA 16-color palette indices.
//
// The original DOS data also embeds non-hex "special" escapes
// (`^< ^, ^/ ^! ^? ^= ^) ^" ^&` …) — see notes/findings.md. These are NOT
// a separate feature: the game's decoder computed the color arithmetically
// as roughly `(char - '0')`, so punctuation on either side of the '0'..'9'
// range simply yields more palette indices. Reproduced here as the low
// nibble of `(charCode - 0x30)`:
//   ':' '<' '=' '?' (0x3A..0x3F)  -> 10..15
//   '!' '"' '&' ')' '/' …(0x21..0x2F) -> (code-0x30)&0xF  (1..15, no blink)
// This is the bright highlight the original drew around prices / hotkeys /
// stat values (e.g. `^/#` руб, `^,15`, `^!p`). The hex path below keeps the
// port's existing meaning for 0-F; the port's own strings only ever use the
// hex digits, so the punctuation branch affects original-data fragments only.
export function writeAt(buf, x, y, text, fg = 7, bg = 0) {
  // Caller-provided fg=0 is interpreted as "default" too.
  let curFg = fg === 0 ? 7 : fg;
  let curBg = bg;
  let cx = x, cy = y;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '^' && i + 1 < text.length) {
      const n = text[i + 1];
      const idx = '0123456789ABCDEFabcdef'.indexOf(n);
      if (idx >= 0) {
        let palette = idx >= 16 ? idx - 6 : idx;
        if (palette === 0) palette = 7;        // ^0 -> default (gray)
        curFg = palette;
        i++;
        continue;
      }
      const cc = n.charCodeAt(0);
      if ((cc >= 0x21 && cc <= 0x2F) || (cc >= 0x3A && cc <= 0x3F)) {
        curFg = (cc - 0x30) & 0x0F;            // original ASCII-offset color
        i++;
        continue;
      }
    }
    if (c === '\n') { cx = x; cy++; continue; }
    setCell(buf, cx, cy, c, curFg, curBg);
    cx++;
    if (cx >= buf.cols) { cx = x; cy++; }
  }
}

// Box-drawing chars rendered as primitives so they tile correctly even
// when the chosen web font has poor coverage. Each entry maps a Unicode
// glyph to a list of {h(orizontal), v(ertical), d(ouble), seg(ment)}
// rectangles in cell-local units (0..CELL_W, 0..CELL_H).
//
// We render each glyph as up to two stems (horizontal + vertical) plus
// any decorations. The 4-bit "directions" tell which sides of the
// crossing point are connected: bit 0 = up, 1 = right, 2 = down, 3 = left.
//
// Single-line chars (─, │, ┌ etc.) use 1px thick stems on a 9x16 cell.
// Double-line chars (═, ║, ╔ etc.) use two parallel 1px stems.

const LINE_THICK = 1;          // pixels (single line)
const DOUBLE_GAP = 2;          // pixels between the two stems
const MIDX = (CELL_W >> 1);    // crossing column
const MIDY = (CELL_H >> 1);    // crossing row

// dirs: 4-bit mask  (up=1, right=2, down=4, left=8)
const SINGLE_BOX = {
  '─': 0b1010, // L+R
  '│': 0b0101, // U+D
  '┌': 0b0110, // R+D
  '┐': 0b1100, // L+D
  '└': 0b0011, // U+R
  '┘': 0b1001, // U+L
  '├': 0b0111, // U+R+D
  '┤': 0b1101, // U+L+D
  '┬': 0b1110, // L+R+D
  '┴': 0b1011, // U+L+R
  '┼': 0b1111, // all
};

const DOUBLE_BOX = {
  '═': 0b1010,
  '║': 0b0101,
  '╔': 0b0110,
  '╗': 0b1100,
  '╚': 0b0011,
  '╝': 0b1001,
  '╠': 0b0111,
  '╣': 0b1101,
  '╦': 0b1110,
  '╩': 0b1011,
  '╬': 0b1111,
};

// Half-block / full-block primitives.
const BLOCKS = {
  '█': [[0, 0, CELL_W, CELL_H]],
  '▀': [[0, 0, CELL_W, CELL_H / 2]],
  '▄': [[0, CELL_H / 2, CELL_W, CELL_H / 2]],
  '▌': [[0, 0, CELL_W / 2, CELL_H]],
  '▐': [[CELL_W / 2, 0, CELL_W / 2, CELL_H]],
  '░': null, // shaded — we use a stipple pass below
  '▒': null,
  '▓': null,
};

// Typographic chars the port uses that codepage 866 has no glyph for
// (« » — …). The original DOS game data never used these (it used straight
// ASCII quotes/hyphens), so there's no authentic VGA bitmap to copy — instead
// we hand-draw them in the same 8x16 / 9-wide-cell pixel idiom as the bitmap
// font, listed as cell-local [x, y, w, h] fillRects. This keeps the screen
// 100% crisp bitmap and makes the ctx.fillText web-font path dead code (kept
// only as a final safety net for any future stray char).
const SYNTH_GLYPHS = {
  // Em dash: full-cell-width 1px rule at the vertical middle. Spans all 9
  // columns so consecutive em dashes join into a continuous line.
  '—': [[0, 7, CELL_W, 1]],
  // Ellipsis: three 2x2 dots sitting near the baseline.
  '…': [[0, 13, 2, 2], [3, 13, 2, 2], [6, 13, 2, 2]],
  // Left guillemet «: two left-pointing chevrons (apex at col 0/3, row 7).
  '«': [[2, 5], [5, 5], [1, 6], [4, 6], [0, 7], [3, 7], [1, 8], [4, 8], [2, 9], [5, 9]]
        .map(([x, y]) => [x, y, 1, 1]),
  // Right guillemet »: mirror of « (apex at col 2/5, row 7).
  '»': [[0, 5], [3, 5], [1, 6], [4, 6], [2, 7], [5, 7], [1, 8], [4, 8], [0, 9], [3, 9]]
        .map(([x, y]) => [x, y, 1, 1]),
};

function drawBoxRects(ctx, x, y, dirs, double) {
  // Compute the two-stem rectangles for a single character.
  // Horizontal stem spans across left/right of the cell.
  // Vertical stem spans across top/bottom of the cell.
  // The stem extends from the cell edge to MIDX/MIDY ± thickness/2
  // unless that side is connected (then full edge).
  const rects = [];

  const stems = double ? 2 : 1;
  const gap = double ? DOUBLE_GAP : 0;

  for (let s = 0; s < stems; s++) {
    const off = double ? (s === 0 ? -1 : 1) : 0; // -1 above/left of mid, +1 below/right of mid
    // Horizontal segment
    const hy = MIDY + off * (gap >> 1) - (LINE_THICK >> 1);
    if (dirs & 0b1000) rects.push([0, hy, MIDX + 1, LINE_THICK]); // left
    if (dirs & 0b0010) rects.push([MIDX, hy, CELL_W - MIDX, LINE_THICK]); // right
    // Vertical segment
    const vx = MIDX + off * (gap >> 1) - (LINE_THICK >> 1);
    if (dirs & 0b0001) rects.push([vx, 0, LINE_THICK, MIDY + 1]); // up
    if (dirs & 0b0100) rects.push([vx, MIDY, LINE_THICK, CELL_H - MIDY]); // down
  }

  for (const [rx, ry, rw, rh] of rects) {
    ctx.fillRect(x + rx, y + ry, rw, rh);
  }
}

// Render all 256 CP866 glyphs into one offscreen atlas (16x16 grid of CELL_W x
// CELL_H cells) painted in `colorHex`, with transparent background so it can be
// blitted over the already-filled background pass. The 9th pixel column of a
// 9-wide VGA cell duplicates the 8th column ONLY for the line-drawing codes
// 0xC0..0xDF, which is what makes horizontal box rules join seamlessly.
function buildGlyphAtlas(colorHex) {
  const atlas = document.createElement('canvas');
  atlas.width = 16 * CELL_W;
  atlas.height = 16 * CELL_H;
  const a = atlas.getContext('2d');
  a.imageSmoothingEnabled = false;
  a.fillStyle = colorHex;
  for (let b = 0; b < 256; b++) {
    const baseX = (b & 15) * CELL_W;
    const baseY = (b >> 4) * CELL_H;
    const replicate9th = b >= 0xC0 && b <= 0xDF;
    for (let row = 0; row < CELL_H; row++) {
      const bits = GLYPHS[b * CELL_H + row];
      if (!bits) continue;
      for (let col = 0; col < 8; col++) {
        if (bits & (0x80 >> col)) a.fillRect(baseX + col, baseY + row, 1, 1);
      }
      if (replicate9th && (bits & 0x01)) a.fillRect(baseX + 8, baseY + row, 1, 1);
    }
  }
  return atlas;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    // Per-foreground-color CP866 glyph atlases, built lazily on first use.
    this.atlases = new Array(16).fill(null);
    // Web-font fallback for the few chars CP866 lacks (« » — …). VT323 covers
    // Latin/Cyrillic; box-drawing chars are served by the bitmap atlas.
    this.fontSpec = `${CELL_H}px "VT323", "Menlo", "Consolas", "DejaVu Sans Mono", "Courier New", monospace`;
  }

  atlasFor(fg) {
    if (!this.atlases[fg]) this.atlases[fg] = buildGlyphAtlas(PALETTE[fg]);
    return this.atlases[fg];
  }

  draw(buf) {
    const { ctx } = this;
    ctx.font = this.fontSpec;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    // Pass 1: backgrounds (fillRect per cell).
    for (let y = 0; y < buf.rows; y++) {
      for (let x = 0; x < buf.cols; x++) {
        const cell = buf.cells[y * buf.cols + x];
        ctx.fillStyle = PALETTE[cell.bg & 0xF];
        ctx.fillRect(x * CELL_W, y * CELL_H, CELL_W, CELL_H);
      }
    }

    // Pass 2: glyphs. Authentic CP866 bitmap glyphs are blitted from the
    // per-color atlas. Chars CP866 doesn't have fall back to box-drawing
    // primitives (kept for safety) and finally the web font.
    for (let y = 0; y < buf.rows; y++) {
      for (let x = 0; x < buf.cols; x++) {
        const cell = buf.cells[y * buf.cols + x];
        const ch = cell.ch;
        if (ch === ' ' || ch === '') continue;
        const fg = cell.fg & 0xF;
        const dx = x * CELL_W, dy = y * CELL_H;

        const byte = CP866_BY_CHAR[ch];
        if (byte !== undefined) {
          const atlas = this.atlasFor(fg);
          ctx.drawImage(atlas, (byte & 15) * CELL_W, (byte >> 4) * CELL_H,
                        CELL_W, CELL_H, dx, dy, CELL_W, CELL_H);
          continue;
        }

        ctx.fillStyle = PALETTE[fg];
        if (SINGLE_BOX[ch] !== undefined) {
          drawBoxRects(ctx, dx, dy, SINGLE_BOX[ch], false);
        } else if (DOUBLE_BOX[ch] !== undefined) {
          drawBoxRects(ctx, dx, dy, DOUBLE_BOX[ch], true);
        } else if (BLOCKS[ch]) {
          for (const [rx, ry, rw, rh] of BLOCKS[ch]) {
            ctx.fillRect(dx + rx, dy + ry, rw, rh);
          }
        } else if (SYNTH_GLYPHS[ch]) {
          for (const [rx, ry, rw, rh] of SYNTH_GLYPHS[ch]) {
            ctx.fillRect(dx + rx, dy + ry, rw, rh);
          }
        } else {
          ctx.fillText(ch, dx, dy);
        }
      }
    }
    buf.dirty = false;
  }
}
