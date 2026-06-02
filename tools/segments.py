#!/usr/bin/env python3
"""Use the MZ relocation table to identify code/data segments in GOPNIK.EXE.

Each relocation entry fixes up a 16-bit immediate that holds a segment
value relative to the load segment. Reading the pre-relocation value at
each relocation site gives a histogram of all segments the binary
references; the most-referenced ones are almost certainly _CODE and
_DATA. From there we can compute the file offset of each segment.
"""
import pathlib, struct
from collections import Counter

EXE = pathlib.Path(__file__).resolve().parent.parent / "GOPNIK.EXE"
d = EXE.read_bytes()

(sig, last_page, pages, relocs, hdr_para, _, _,
 _, _, _, ip, cs_, reloc_off, _) = struct.unpack("<2sHHHHHHhHHHhHH", d[:28])
HDR = hdr_para * 16

# Read every relocation entry, fetch the immediate at that location.
imm_at_reloc = Counter()
reloc_sites_by_seg_imm = {}
for i in range(relocs):
    off, seg = struct.unpack("<HH", d[reloc_off + i * 4 : reloc_off + i * 4 + 4])
    file_loc = HDR + seg * 16 + off
    if file_loc + 2 > len(d): continue
    imm = struct.unpack("<H", d[file_loc:file_loc+2])[0]
    imm_at_reloc[imm] += 1
    reloc_sites_by_seg_imm.setdefault(imm, []).append((seg, off, file_loc))

print("Top segment immediates fixed up by relocations:")
for seg_imm, n in imm_at_reloc.most_common(15):
    print("  seg=0x%04X  refs=%d  file_offset=0x%06X  (image=0x%06X)" % (
        seg_imm, n, HDR + seg_imm * 16, seg_imm * 16))

# Also show the entry segment.
print()
print(f"Entry CS={cs_:#06X} -> file=0x{HDR + cs_*16:06X}")
print(f"DS at startup is set by Borland startup from one of these segments.")
print(f"Number of distinct segment immediates: {len(imm_at_reloc)}")

# Find the segment whose contents look like the known string fragments
# (0x1ACB-ish in file; image=0x0019B5 = (segment 0)*16 + 0x19B5? Or
# segment 0 itself starts at HDR.) We have a fragment at file_off 0x18D0
# whose contents we know. Find which segment_imm's range covers it.
import json
frags = json.loads((EXE.parent / "assets" / "screens_raw.json").read_text())
example_fo = frags[0]["file_offset"]
example_text = frags[0]["text"][:30]
print(f"\nExample fragment @ file=0x{example_fo:06X}: {example_text!r}")
print("Searching for segment immediates that point near this fragment:")
for seg_imm, n in imm_at_reloc.most_common(60):
    seg_file = HDR + seg_imm * 16
    delta = example_fo - seg_file
    if 0 <= delta < 0x10000:
        print(f"  seg=0x{seg_imm:04X} (file=0x{seg_file:06X}) -> frag offset 0x{delta:04X} within segment  refs={n}")
