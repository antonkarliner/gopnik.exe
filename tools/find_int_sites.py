#!/usr/bin/env python3
"""Locate INT 10h/16h/21h/33h call sites in GOPNIK.EXE and dump short context.

Crude but effective: scan for INT opcodes (0xCD 0xNN). The context window
around each call is printed so we can guess the DOS service number from the
AH/AX setup in the immediately preceding bytes.
"""
import pathlib, sys

EXE = pathlib.Path(__file__).resolve().parent.parent / "GOPNIK.EXE"
d = EXE.read_bytes()

# MZ header so we can compute the in-memory CS:IP for each hit.
import struct
(sig, last_page, pages, relocs, hdr_para, min_alloc, max_alloc,
 ss, sp, checksum, ip, cs, reloc_off, overlay) = struct.unpack(
    "<2sHHHHHHhHHHhHH", d[:28])
HDR = hdr_para * 16

WANTED = {0x10, 0x16, 0x21, 0x33}
ctx_before, ctx_after = 12, 4

hits = []
i = HDR
while i < len(d) - 1:
    if d[i] == 0xCD and d[i + 1] in WANTED:
        hits.append((i, d[i + 1]))
        i += 2
    else:
        i += 1

for off, svc in hits:
    code_off = off - HDR
    pre = d[max(HDR, off - ctx_before):off]
    post = d[off:off + 2 + ctx_after]
    hexpre = " ".join(f"{b:02X}" for b in pre)
    hexpost = " ".join(f"{b:02X}" for b in post)
    # Try to spot a mov ah,X (B4 XX) or mov ax,XXXX (B8 XX XX) right before.
    hint = ""
    for j in range(len(pre) - 1, -1, -1):
        b = pre[j]
        if b == 0xB4 and j + 1 < len(pre):
            hint = f"AH={pre[j+1]:02X}"
            break
        if b == 0xB8 and j + 2 < len(pre):
            hint = f"AX={pre[j+2]:02X}{pre[j+1]:02X}"
            break
    print(f"INT {svc:02X}h @ file=0x{off:06X} (image=0x{code_off:06X})  pre={hexpre}  INT={hexpost}  {hint}")
print(f"\n{len(hits)} INT call sites total")
