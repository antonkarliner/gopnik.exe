# GOPNIK.EXE web port

Faithful browser reimplementation of `GOPNIK.EXE`, an 88,656-byte MS-DOS
Russian street-life text RPG from 2003 by V.P.U.

This is not an emulator. The game is being reverse-engineered and rebuilt in
plain HTML, Canvas, and JavaScript so it can run in a modern browser while
matching the original DOS behavior as closely as possible.

## Status

The port has a playable walking skeleton:

- 80x25 VGA-style text renderer on `<canvas>`
- CP866 Cyrillic 8x16 bitmap font
- boot, title, intro, difficulty, and play states
- command REPL with the recovered command vocabulary
- location handlers, combat loop, shops, training, club, vet, and save transfer
- Borland C++ 3.1 `rand()` reproduction
- localStorage saves plus JSON export/import
- reverse-engineering notes and extractor/disassembly tools

See [notes/SESSION_LOG.md](notes/SESSION_LOG.md) for the development diary and
[notes/findings.md](notes/findings.md) for recovered binary knowledge.

## Faithfulness and rebalancing

The goal is a faithful port, and where a mechanic or value has been recovered
from the original binary (via disassembly / Ghidra decompilation / extracted
strings) the port reproduces it — these are flagged with EXE offsets in the
code comments and in `notes/findings.md`.

That said, **not every value is faithful to the source**. Some are port
additions or have been **rebalanced for playability**, because the original
value was never recovered or simply did not feel good in a browser session.
Examples:

- The **понтовость (street-cred) economy** has been tuned — the price/gain of a
  round of beer in the притон uses diminishing returns, and the club/backup
  thresholds were raised, so cred is earned rather than maxed in a couple of
  clicks.
- Various shop prices, per-district scaling, and encounter values are port
  approximations rather than exact recoveries.
- Saves use `localStorage` plus a JSON export/import instead of the original
  `.sav` binary format (which is intentionally not reversed).

When in doubt, the code comments distinguish RE-grounded values (with offsets)
from tuned-for-feel ones, and `notes/SESSION_LOG.md` records the reasoning
behind each balance change.

## Run

Start a local static server from the repository root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

The current flow is:

```text
boot -> title -> intro -> difficulty -> play REPL
```

Click the game screen before typing. Press `F` for fullscreen.

## Development

The app is ES-module based and intentionally has no build step. When editing a
module, bump the `?v=N` cache-busting query string in all module imports and in
`index.html`.

Useful checks:

```bash
find src -name '*.js' -exec node --check {} \;
.venv/bin/python tools/header_dump.py
.venv/bin/python tools/extract_screens.py
.venv/bin/python tools/disasm.py
```

For original-game comparison, use DOSBox-X:

```bash
/Applications/dosbox-x.app/Contents/MacOS/dosbox-x \
  -fastlaunch -nomenu \
  -c "mount c ." -c "c:" -c "gopnik.exe"
```

Set `chcp 866` in DOS before launching if you need correct Cyrillic rendering.

## Repository contents

- `GOPNIK.EXE` is the original reference binary used for reverse engineering.
- `src/` contains the browser port.
- `assets/` contains extracted CP866 strings/screens and the VGA font source.
- `tools/` contains Python reverse-engineering helpers.
- `notes/` contains findings, disassembly dumps, function maps, and session logs.
- `ghidra_proj/` contains the Ghidra project snapshot.

## License

The JavaScript port, Python tools, and all other original files in this
repository are released under the **GNU General Public License v2.0**.
See [LICENSE](LICENSE) for the full text.

`GOPNIK.EXE` is **not** covered by this license. It is an original 2003
MS-DOS program credited to "V.P.U." and is included here solely as a
reference artifact for reverse-engineering and preservation purposes. All
rights to the original binary remain with its author(s). If you are the
author or rights holder and have concerns about its inclusion, please open
an issue.
