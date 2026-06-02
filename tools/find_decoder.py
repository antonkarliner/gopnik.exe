#!/usr/bin/env python3
"""Locate the ^N color-decoder routine in GOPNIK.EXE.

Hypothesis: the game has a function `draw_line(text)` that walks a string
byte by byte, looks for '^' (0x5E), reads the next char as a color code,
sets the conio color via Borland's textcolor()/textbackground(), and
emits the rest via cputs(). Such a routine would contain a comparison
to immediate 0x5E ('^') somewhere in its body.

We scan for `cmp al, 0x5E` (3C 5E) and `cmp ah, 0x5E` (80 FC 5E),
the most common Borland-emitted forms.
"""
import pathlib, re, struct

EXE = pathlib.Path(__file__).resolve().parent.parent / "GOPNIK.EXE"
d = EXE.read_bytes()

(_, _, _, _, hdr_para) = struct.unpack("<HHHHH", d[2:12])
HDR = hdr_para * 16

patterns = {
    "cmp al,0x5E (3C 5E)":           rb"\x3C\x5E",
    "cmp ah,0x5E (80 FC 5E)":        rb"\x80\xFC\x5E",
    "cmp byte ptr [..],0x5E":        rb"\x80\x3D\x5E",
    "cmp word var,0x5E":             rb"\x83\x3D\x5E",
    "mov al, '^' literal":           rb"\xB0\x5E",
    "shr al,4 (C0 E8 04)":           rb"\xC0\xE8\x04",   # parsing high nibble of hex digit
    "sub al,'0' (2C 30)":            rb"\x2C\x30",       # ASCII -> int
    "and al,0x0F (24 0F)":           rb"\x24\x0F",       # mask low nibble
    "cmp al, '9' (3C 39)":           rb"\x3C\x39",       # hex range check
    "cmp al, 'A' (3C 41)":           rb"\x3C\x41",
}

print("Patterns related to ^N decoder:")
for label, pat in patterns.items():
    hits = [m.start() for m in re.finditer(pat, d)]
    print("%-36s %5d  %s" % (label, len(hits), ", ".join(f"0x{h:06X}" for h in hits[:8])))

# For each `cmp al,0x5E` site, dump the surrounding 32 bytes for context.
print("\nContext around each '^' (0x5E) compare:")
for m in re.finditer(rb"\x3C\x5E", d):
    off = m.start()
    if off < HDR: continue
    pre = d[max(HDR, off - 24):off]
    post = d[off:off + 24]
    img = off - HDR
    print("  @file=0x%06X (img=0x%06X)" % (off, img))
    print("    pre:  %s" % " ".join(f"{b:02X}" for b in pre))
    print("    post: %s" % " ".join(f"{b:02X}" for b in post))

# Also look for short fragments in the data segment that *begin* with ^.
# Many fragments end with ^N (color terminator); if any *start* with ^, the
# decoder probably consumes the color first and then the text.
print("\nData fragments that *start* with '^':")
import re as _re
for m in _re.finditer(rb"\x00\x5E[0-9A-Fa-f/#,!?=]", d):
    off = m.start() + 1
    text = d[off:off+24].split(b"\x00")[0]
    print("  @0x%06X  %r" % (off, text))
