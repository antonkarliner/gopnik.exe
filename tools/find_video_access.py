#!/usr/bin/env python3
"""Locate the patterns the game uses to write to text-mode video memory.

In real-mode DOS, B800:xxxx is the color-text VRAM. Common opcode patterns:
  B8 00 B8           mov ax, 0B800h
  68 00 B8           push 0B800h
  C7 06 ?? ?? 00 B8  mov word ptr [imm], 0B800h
We also scan for the address of the BIOS data area (0040:0049) which holds
the current video mode, and for any 'B800' as a 16-bit big-endian word in
the data segment.
"""
import pathlib, re

EXE = pathlib.Path(__file__).resolve().parent.parent / "GOPNIK.EXE"
d = EXE.read_bytes()

patterns = {
    "mov ax,B800h (B8 00 B8)":    rb"\xB8\x00\xB8",
    "mov bx,B800h (BB 00 B8)":    rb"\xBB\x00\xB8",
    "mov cx,B800h (B9 00 B8)":    rb"\xB9\x00\xB8",
    "mov dx,B800h (BA 00 B8)":    rb"\xBA\x00\xB8",
    "mov es,...":                  rb"\x8E\xC0",        # mov es,ax (very common)
    "push 0B800h (68 00 B8)":     rb"\x68\x00\xB8",
    "B800 imm word in data":      rb"\x00\xB8",         # noisy; restrict to non-code regions later
    "Turbo Pascal RTE str":       rb"Runtime error ",
    "Borland copyright":          rb"Borland",
    "1983,92 copyright (TC)":     rb"1983,92",          # Turbo C++
    "1983,92,93 (BC++)":          rb"1983,92,93",
    "CRT in (TP RTL has 'Crt')":  rb"\x03Crt",          # Pascal string with len-prefix
}

for label, pat in patterns.items():
    hits = [m.start() for m in re.finditer(pat, d)]
    head = ", ".join(f"0x{h:06X}" for h in hits[:6])
    print(f"{label:36s} {len(hits):5d}  {head}{' ...' if len(hits) > 6 else ''}")

# Find INT 10h sites with AH=0 (set video mode) — those tell us the mode
print()
print("INT 10h with preceding AH= setup:")
for m in re.finditer(rb"\xCD\x10", d):
    off = m.start()
    # search up to 16 bytes backward for B4 XX (mov ah,XX) or B8 XX XX (mov ax,XX)
    pre = d[max(0, off - 16):off]
    for j in range(len(pre) - 1, -1, -1):
        if pre[j] == 0xB4 and j + 1 < len(pre):
            print(f"  @0x{off:06X}  AH={pre[j+1]:02X}h  context: {pre.hex()}")
            break
        if pre[j] == 0xB8 and j + 2 < len(pre):
            print(f"  @0x{off:06X}  AX={pre[j+2]:02X}{pre[j+1]:02X}h  context: {pre.hex()}")
            break
    else:
        print(f"  @0x{off:06X}  (no immediate AH/AX setup nearby)  context: {pre.hex()}")
