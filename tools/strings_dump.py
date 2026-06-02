#!/usr/bin/env python3
"""Dump printable strings from GOPNIK.EXE with file offsets.

Outputs to assets/strings_raw.json so downstream tools (Phase 2) can
cross-reference offsets against Ghidra's analysis.
"""
import json, pathlib, re

EXE = pathlib.Path(__file__).resolve().parent.parent / "GOPNIK.EXE"
OUT = EXE.parent / "assets" / "strings_raw.json"

d = EXE.read_bytes()
MIN = 4

# Treat printable ASCII + extended bytes that the game uses for ASCII art
# (the `^N` color codes use plain ASCII so we don't need to be clever here).
def printable(b):
    return 0x20 <= b < 0x7F or b == 0x0A or b == 0x0D

strings = []
i, n = 0, len(d)
while i < n:
    if printable(d[i]):
        j = i
        while j < n and printable(d[j]):
            j += 1
        if j - i >= MIN:
            text = d[i:j].decode("latin1", errors="replace")
            strings.append({"file_offset": i, "len": j - i, "text": text})
        i = j
    else:
        i += 1

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(strings, ensure_ascii=False, indent=2))
print(f"{len(strings)} strings written to {OUT.relative_to(EXE.parent)}")
# Print the most interesting (longest 30)
for s in sorted(strings, key=lambda x: -x["len"])[:30]:
    print(f"  @0x{s['file_offset']:06X} ({s['len']:4d}) {s['text']!r}")
