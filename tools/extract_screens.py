#!/usr/bin/env python3
"""Extract screens from GOPNIK.EXE -- CP866-aware (Russian DOS codepage).

The original game is a Russian-language street-life sim. The strings use
codepage 866 for Cyrillic plus the CP437 box-drawing glyphs in the high
bytes. Python's `cp866` codec handles both correctly.
"""
import json, pathlib, re

EXE = pathlib.Path(__file__).resolve().parent.parent / "GOPNIK.EXE"
OUT = EXE.parent / "assets" / "screens_raw.json"

d = EXE.read_bytes()

MIN_LEN = 6
FRAG_RE = re.compile(b"[\x20-\xFF]{%d,}" % MIN_LEN)

frags = []
for m in FRAG_RE.finditer(d):
    text_bytes = m.group()
    # CP866 is the Russian DOS codepage (superset of the relevant CP437
    # box-drawing glyphs).
    decoded = text_bytes.decode("cp866", errors="replace")
    frags.append({
        "file_offset": m.start(),
        "len": len(text_bytes),
        "text": decoded,
        "hex": text_bytes.hex(),
    })

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(frags, ensure_ascii=False, indent=2))

print(f"{len(frags)} fragments -> {OUT.relative_to(EXE.parent)}")
print("\nTop 10 longest fragments (CP866-decoded):\n")
for f in sorted(frags, key=lambda x: -x["len"])[:10]:
    preview = f["text"][:140].replace("\n", " ")
    print(f"  @0x{f['file_offset']:06X} ({f['len']:4d})  {preview}")
