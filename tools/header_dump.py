#!/usr/bin/env python3
"""Parse the MZ header of GOPNIK.EXE and report layout."""
import struct, sys, json, pathlib

EXE = pathlib.Path(__file__).resolve().parent.parent / "GOPNIK.EXE"
d = EXE.read_bytes()
assert d[:2] == b"MZ", "not an MZ executable"

(sig, last_page, pages, relocs, hdr_para, min_alloc, max_alloc,
 ss, sp, checksum, ip, cs, reloc_off, overlay) = struct.unpack(
    "<2sHHHHHHhHHHhHH", d[:28])

header_bytes = hdr_para * 16
exe_image_bytes = (pages - 1) * 512 + (last_page if last_page else 512)
load_image = d[header_bytes:exe_image_bytes]
entry_file_off = header_bytes + cs * 16 + ip

reloc_table = []
for i in range(relocs):
    off, seg = struct.unpack("<HH", d[reloc_off + i * 4: reloc_off + i * 4 + 4])
    reloc_table.append((seg, off))

report = {
    "exe_path": str(EXE),
    "file_size": len(d),
    "header_bytes": header_bytes,
    "exe_image_bytes": exe_image_bytes,
    "load_image_size": len(load_image),
    "entry_cs_ip": [cs, ip],
    "entry_file_offset": entry_file_off,
    "initial_ss_sp": [ss, sp],
    "min_alloc_paragraphs": min_alloc,
    "max_alloc_paragraphs": max_alloc,
    "relocation_count": relocs,
    "first_relocations": reloc_table[:10],
    "last_relocations": reloc_table[-10:],
}
print(json.dumps(report, indent=2))
