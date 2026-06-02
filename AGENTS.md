# GOPNIK web port — development guide for Codex

This is a from-scratch web reimplementation of `GOPNIK.EXE`, an 88,656-byte
MS-DOS executable from 2003 — a Russian street-life text-RPG by V.P.U.
**No emulator** is involved; the goal is a faithful 1:1 reverse-
engineered port in HTML/Canvas/JS that runs in any modern browser and
behaves like the original on a 2003 PC.

Status: walking skeleton + Phase 1 RE complete (state flow + REPL +
title art + persistence). See `notes/SESSION_LOG.md` for the per-session
diary.

---

## Repo layout

```
gopnik/
├── GOPNIK.EXE              the original 88 KB MZ binary (do not modify)
├── index.html              CRT-themed launcher page
├── styles.css              bezel + scanlines + phosphor glow
├── src/
│   ├── main.js             boot + state-machine dispatch
│   ├── render.js           80×25 text-mode renderer onto <canvas>
│   ├── input.js            keyboard + touchpad input queue (INT 16h-style)
│   ├── rng.js              Borland C++ 3.1 LCG rand() reproduction
│   ├── font_cp866.js       AUTO-GEN CP866 8x16 VGA font (base64 + char map)
│   └── states/
│       ├── title.js        Cyrillic ГОПНИК logo + rotating arrow
│       ├── intro.js        3-page narrative + Dean dialog + rules
│       ├── difficulty.js   5-option (0-4) menu
│       ├── play.js         main REPL — 20 commands, localStorage save
│       └── menu.js         help/menu placeholder
├── assets/
│   ├── screens_raw.json    1,930 CP866-decoded screen fragments
│   ├── strings_raw.json    547 strings with file offsets
│   └── cp866.f16           FreeDOS CP866 8x16 VGA font (4096 bytes, raw)
├── tools/
│   ├── header_dump.py      MZ header parse
│   ├── make_font.py        cp866.f16 → src/font_cp866.js generator
│   ├── find_int_sites.py   INT 10h/16h/21h/33h call locator
│   ├── find_video_access.py  B800 / Borland conio pattern hunter
│   ├── find_decoder.py     ^N color-escape decoder pattern hunter
│   ├── segments.py         relocation-table → segment layout
│   ├── extract_screens.py  CP866-aware screen extraction
│   ├── strings_dump.py     printable strings + offsets
│   ├── disasm.py           Capstone recursive disassembly
│   └── ghidra_dump.py      headless Ghidra post-script (needs PyGhidra)
├── notes/
│   ├── findings.md         what we know about the binary
│   ├── SESSION_LOG.md      diary; READ THIS FIRST when resuming
│   ├── disasm.txt          full Capstone disassembly
│   ├── functions.txt       discovered functions + INT calls + callers
│   └── xrefs_data.txt      code → screen-fragment refs
├── ghidra_proj/            Ghidra 12.1 project (run `ghidraRun` to open)
├── .venv/                  Python venv with Capstone (for tools/*.py)
└── .Codex/launch.json     preview-server config (port 8000)
```

---

## How to run locally

```bash
# Start the static server (also auto-started by Codex Preview)
python3 -m http.server 8000
# open http://localhost:8000
```

Or via Codex Preview:

```
mcp__Claude_Preview__preview_start name=gopnik
```

The page boots → title → intro (3 pages) → difficulty → play REPL.

---

## How to verify changes

The state machine is fully drivable from the JS console / preview eval:

```javascript
window.__gopnik = { renderer, buf, input, rng, states, current }
```

Examples (use via `mcp__Claude_Preview__preview_eval`):

```javascript
// Read current state
window.__gopnik.current

// Force-advance from boot (rAF is throttled when the preview is backgrounded)
window.__gopnik.states.boot.ticks = 999;

// Push a key event into the input queue
window.__gopnik.input.push({ key: 'Enter', code: 'Enter' });

// Dump the canvas buffer as text
const g = window.__gopnik;
const rows = [];
for (let y = 0; y < 25; y++) {
  let s = '';
  for (let x = 0; x < 80; x++) s += g.buf.cells[y*80+x].ch;
  rows.push(s.replace(/\s+$/, ''));
}
rows;
```

To verify against the **original game**, run it in DOSBox-X:

```bash
/Applications/dosbox-x.app/Contents/MacOS/dosbox-x \
  -fastlaunch -nomenu \
  -c "mount c ." -c "c:" -c "gopnik.exe"
```

⚠️ Note: by default DOSBox-X renders the game's CP866 bytes through a
CP437 font, so Russian text looks garbled. Set `chcp 866` at the DOS
prompt before launching the game to see correct Cyrillic.

⚠️ Driving DOSBox-X via `computer-use` is slow: only one character per
`type` call reliably arrives. Use single-key presses for command input.

---

## ES-module cache busting

Browsers cache ES modules **by URL** indefinitely — once `render.js?v=6`
is loaded, editing the file on disk and reloading the page reuses the
cached module. The repo convention:

- Every module import (and the `<script type="module">` in `index.html`)
  carries a `?v=N` query string.
- When you edit any module, bump **all** files' `?v=N` in lockstep:

```bash
cd /Users/antonkarliner/GitHub/gopnik
sed -i.bak 's|?v=6|?v=7|g' src/main.js src/states/*.js index.html
rm -f src/*.bak src/states/*.bak *.bak
```

Then reload with cache-bust:

```javascript
location.href = location.pathname + '?bust=' + Date.now();
```

---

## Architectural notes

### Renderer (`src/render.js`)

- 80×25 character grid → 720×400 canvas (9×16 cells), drawn 1 VGA pixel
  per canvas pixel, CSS upscales with `image-rendering: pixelated`.
- Standard CGA 16-color palette in `PALETTE[]`.
- Glyphs are blitted from the **authentic CP866 8x16 VGA bitmap font**
  (`src/font_cp866.js`, generated by `tools/make_font.py` from
  `assets/cp866.f16`). The renderer builds one lazy glyph atlas per
  foreground color and `drawImage`s each cell; the VGA 9th-column
  replication for line-draw codes `0xC0–0xDF` is baked in so box rules
  join. Chars CP866 lacks (`« » — …`) fall back to box-drawing
  primitives then `ctx.fillText` (web font).
- `writeAt(buf, x, y, text, fg, bg)` parses `^N` escapes inline.

### `^N` color escapes — important quirks

- `^0`–`^F` map to CGA palette indices 0..15, **EXCEPT** that `^0` is
  interpreted as "reset to default = 7 (light gray)", not literal color
  0 (black). The renderer also treats a caller-provided `fg=0` as 7.
  This matches what the original DOS binary actually draws (verified
  side-by-side in DOSBox-X).
- Beyond hex digits, the data segment also contains `^<`, `^,`, `^/`,
  `^#`, `^!`, `^?`, `^=` — these aren't decoded yet; they pass through
  as literal chars. The actual decoder routine is one of the things
  the Ghidra phase needs to pin down.

### State machine (`src/main.js`)

```
boot ──(auto, 110 ticks)──> title ──(any key)──> intro
                                                   │
                                          (3 pages, Enter)
                                                   │
                                                   ▼
                                              difficulty ──(Enter)──> play
                                                   ▲                   │
                                                   └───(Esc)───────────┘
```

Each state is `{ enter?, leave?, update(inputQ) -> nextStateName|null, draw(buf) }`.

### Input layer (`src/input.js`)

DOS INT 16h-style FIFO. Each entry: `{ key, code, ascii }`. The play
state has its own mini-mode (`'cmd'` vs `'name'`) so the same queue
serves both single-key navigation and typed text.

### Persistence (`src/states/play.js`)

`STATE` is loaded from `localStorage["gopnik.state.v1"]` at module init
and re-persisted on every mutating command + on Esc / exit.

**Save format decision (settled):** the port does **not** reverse or
reproduce the original binary `.sav` format. The port's STATE has
diverged too far from the 2003 binary to round-trip losslessly, and a
binary interchange serves almost no user. Saves live in localStorage
(per-device) plus a lossless **JSON** export/import (`src/save_transfer.js`,
Session 24) for moving a save between machines/browsers. The `.sav`
reversal idea is **dropped** — do not pursue it.

---

## Original-game knowledge (cheat sheet)

- **Toolchain**: Borland C++ 3.1, LARGE memory model, plain MZ (not packed).
- **Codepage**: **CP866** (Russian DOS). NOT Latin-1, NOT CP437. Decoder is
  `bytes.decode('cp866')`.
- **Entry**: CS:IP = 0:0xAB59 → file offset 0xC429.
- **Segments**: 4 code (0x0EE5, 0x0EED, 0x0F16, 0x0F78) + 1 DGROUP (0x10AE).
- **Renderer**: Borland `conio.h` (`cputs`, `textcolor`, `gotoxy`). Single
  INT 10h is a thin BIOS wrapper. No direct B800h immediates.
- **RNG**: Borland `rand()` LCG, `seed = seed * 0x015A4E35 + 1`,
  output = `(seed >> 16) & 0x7FFF`. Implemented in `src/rng.js`.
- **Save files**: `places.sav` + `save_r0.sav`..`save_r9.sav` slots, written via
  `INT 21h` AH=3C/3F/40/42/3E. Format intentionally **not** reversed — the port
  uses localStorage + JSON export/import instead (see Persistence above).

### 20 commands (verbatim from EXE @ 0xBFDF)

| Cmd | What it does |
|---|---|
| `w` | шататься по окрестностям |
| `mar` | идти на рынок |
| `bmar` | идти к барыгам |
| `rep` | идти к ветеринару |
| `girl` | завалиться к своей девчонке |
| `pr` | идти в местный притон гопоты |
| `kl` | идти в клуб |
| `trn` | идти в качалку |
| `s` | посмотреть в лужу на свою уродскую рожу |
| `sv` | приглядеться к пинаемому мудаку |
| `k` | гасить мудака |
| `v` | позвать подкрепление |
| `kos` | схавать косяк |
| `h` | выпить пиво |
| `mh` | набухаться до чёртиков |
| `name` | сменить погоняло |
| `save` / `load` / `reset` | port additions (localStorage) |
| `e` / `exit` | выйти в меню |

### Story (intro narrative from EXE @ 0x81B1)

> Ты приехал в Ельцовку. Отовсюду доносятся крики запинываемых.
> Пора наконец отомстить ректору. Доказать свою крутизну ты можешь,
> окоротив главного отморозка района.

Game ends when you take down the dean (Ректор) or get beaten enough.

### Stat formulas (recovered from EXE @ 0x735A)

```
Точность = (20 + Ловкость × 5) % 7      // accuracy (hit %)
Броня    = уменьшает урон врага         // armor reduces dmg
```

---

## Tooling

### Python static-analysis

```bash
# All scripts run from repo root via the venv:
.venv/bin/python tools/header_dump.py
.venv/bin/python tools/extract_screens.py     # → assets/screens_raw.json
.venv/bin/python tools/disasm.py              # → notes/disasm.txt
.venv/bin/python tools/find_int_sites.py
.venv/bin/python tools/find_video_access.py
.venv/bin/python tools/segments.py
```

### Ghidra (headless dump — PyGhidra)

Ghidra 12.1 dropped the bundled Jython, so `.py` scripts now run through
**PyGhidra** (a CPython↔JVM bridge), configured in a dedicated venv:

```bash
# One-time setup (already done): py3.13 venv + Ghidra's bundled PyGhidra wheel.
python3.13 -m venv .venv-ghidra
.venv-ghidra/bin/pip install \
  /opt/homebrew/Cellar/ghidra/12.1/libexec/Ghidra/Features/PyGhidra/pypkg/dist/pyghidra-3.1.0-py3-none-any.whl

# Regenerate notes/ghidra_{functions,decomp,strings}.txt (imports + auto-analyzes
# GOPNIK.EXE into a throwaway project; ~10s):
GHIDRA_INSTALL_DIR=/opt/homebrew/Cellar/ghidra/12.1/libexec \
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
.venv-ghidra/bin/python tools/pyghidra_dump.py
```

⚠️ Ghidra 12.1 needs **JDK 21** (only `openjdk@21` works; the default
`java` is 17). The `.venv-ghidra` must be **py3.13** — JPype has no
py3.14 wheel yet (the repo's main `.venv` is 3.14, so don't reuse it).

`tools/pyghidra_dump.py` supersedes the old `tools/ghidra_dump.py`
(analyzeHeadless/Jython post-script, no longer runnable on 12.1).
For interactive exploration: `ghidraRun` opens the GUI on `ghidra_proj/`.

Key functions (from the dump — Ghidra bases the load segment at `1000`):

- `entry` @ `1000:ab59` — Borland startup then user `main`.
- `FUN_1000_6a0d` @ `1000:6a0d` — user `main()` (allocates the 256-byte
  command-input buffers).
- `FUN_1000_3d11` @ `1000:3d11` — **wander + combat + special street
  encounters** (the action core; incl. the маньяк encounter).
- `FUN_1000_0d14` @ `1000:0d14` — **enemy spawn** (archetype roll + stat
  distribution); the 10×4 weight table is at DGROUP file `0x123b2`.
- `FUN_1f16_031a` (INT 16h, **60 callers**) — Borland `getch` with an
  ungetch buffer at `[0x3ec9]`; the input primitive used everywhere.
- `FUN_1f16_0614` (the single INT 10h, **15 callers**) — the conio BIOS
  video wrapper; its callers are the output sites.
- The `1f78`/`1f16` functions calling INT 21h are the DOS file-IO layer
  (.sav open/read/write/close) — relevant only if saves are revisited.

The **full seg-1000 game-logic function map** (status screen, char
creation, drink/temple/mage handlers, win/lose screens, etc.) — recovered
by decoding each function's CP866 string immediates — is in
`notes/findings.md` → "Function map — seg-1000 game logic".

Note: `ghidra_strings.txt` comes out sparse (Ghidra's 16-bit auto-analysis
doesn't define the seg-0 `mov dx,imm` strings as data). Use the Python
extractors' `assets/strings_raw.json` (547) / `screens_raw.json` (1,930)
for string content instead.

### DOSBox-X

```bash
# Auto-launch the game:
/Applications/dosbox-x.app/Contents/MacOS/dosbox-x \
  -fastlaunch -nomenu \
  -c "mount c ." -c "c:" -c "gopnik.exe"

# To see Cyrillic correctly, type at the DOS prompt before launching:
# chcp 866
```

---

## Common pitfalls

- **Cache stale modules**: if your edits don't appear, bump `?v=N`.
- **Tab throttled to 1 fps**: when the preview tab is backgrounded,
  `requestAnimationFrame` is throttled. For tests, set
  `states.boot.ticks = 999` then call `states.title.draw(buf)` and
  `renderer.draw(buf)` directly.
- **Path case**: macOS HFS+ is case-insensitive but the repo path is
  `/Users/antonkarliner/GitHub/gopnik` (capital G). Lowercase works
  via case-folding but stick with `GitHub` to avoid confusion.
- **Don't use `rm -rf`**: the harness blocks it. Use `-overwrite`
  flags on tools that support it.

---

## How to resume

1. Read `notes/SESSION_LOG.md` top entry — it lists what just shipped
   and what's next.
2. Read `notes/findings.md` for the RE knowledge dump.
3. Pick a chunk from the "What's next" list at the top of SESSION_LOG.
   Reasonable next chunks:
   - Build richer per-location encounters from the catalogued
     fragments in `assets/screens_raw.json`.
   - Add a proper back-and-forth fight loop with enemy stats.

   ⚠️ **Not** a chunk: reversing the original `.sav` format. That idea
   is dropped — saves use localStorage + JSON export/import
   (`src/save_transfer.js`), see the Persistence note above.

When you start work, mark the relevant task #5/#6/#8/#9/#13/#16 as
`in_progress` (see existing list via `TaskList`), and update
`SESSION_LOG.md` with a new "Session N" section at the top when you
finish.
