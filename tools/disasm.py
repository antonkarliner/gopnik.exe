#!/usr/bin/env python3
"""Recursive Capstone-based disassembler for GOPNIK.EXE.

Starts from the entry point and follows control flow (CALL/JMP/Jcc
targets) recording every reachable function, INT site, and data ref.
Outputs:
  notes/functions.txt  function list with size, INTs, callers, far-call
                       targets (Borland runtime segs)
  notes/disasm.txt     disassembly of every discovered function
  notes/xrefs_data.txt code -> screen-fragment references
"""
import pathlib, struct, json
from collections import Counter, defaultdict
from capstone import Cs, CS_ARCH_X86, CS_MODE_16, CS_OP_IMM

EXE = pathlib.Path(__file__).resolve().parent.parent / "GOPNIK.EXE"
OUT = pathlib.Path(__file__).resolve().parent.parent / "notes"
d = EXE.read_bytes()

hdr_para = struct.unpack("<H", d[8:10])[0]
ip = struct.unpack("<H", d[20:22])[0]
cs_seg = struct.unpack("<h", d[22:24])[0]
HDR = hdr_para * 16
load = d[HDR:]
ENTRY = (cs_seg * 16 + ip) & 0xFFFFF

md = Cs(CS_ARCH_X86, CS_MODE_16)
md.detail = True

# ---------------------------------------------------------------------------
# Recursive disassembly with a per-function body trace.
# ---------------------------------------------------------------------------

functions = {}   # entry -> dict(size, ints, far_calls, near_calls, data_imms, body)
queue = [ENTRY]
seen_entries = set()

# Conditional jumps and unconditional jumps (Capstone mnemonics).
COND = {"je", "jne", "jz", "jnz", "ja", "jae", "jb", "jbe", "jg", "jge",
        "jl", "jle", "jo", "jno", "js", "jns", "jp", "jnp", "jcxz", "jecxz",
        "loop", "loope", "loopne"}

def disassemble_function(entry):
    body = []                # list of (addr, mnem, op_str, hex)
    ints = set()
    near_calls = set()
    far_calls = set()        # (seg, off)
    data_imms = set()
    local_visited = set()
    addr_queue = [entry]
    while addr_queue:
        addr = addr_queue.pop()
        if addr in local_visited: continue
        local_visited.add(addr)
        steps = 0
        while addr < len(load) and steps < 4096:
            steps += 1
            chunk = load[addr:min(addr + 16, len(load))]
            ins = next(md.disasm(chunk, addr), None)
            if ins is None:
                addr += 1
                continue
            mnem = ins.mnemonic
            ops_imms = []
            try:
                for op in ins.operands:
                    if op.type == CS_OP_IMM:
                        ops_imms.append(op.imm)
            except Exception:
                # detail not available for this insn; skip operand probe
                pass

            if mnem == "int" and ops_imms:
                ints.add(ops_imms[0] & 0xFF)
            elif mnem == "call" and ops_imms:
                near_calls.add(ops_imms[0] & 0xFFFF)
                queue.append(ops_imms[0] & 0xFFFF)
            elif mnem == "lcall" and len(ops_imms) >= 2:
                # capstone gives offset, segment for lcall args
                far_calls.add((ops_imms[0] & 0xFFFF, ops_imms[1] & 0xFFFF))
            elif mnem == "jmp" and ops_imms:
                # Jump can leave function; if it's a backwards short jump,
                # follow it; otherwise treat as tail-call (don't follow).
                t = ops_imms[0] & 0xFFFF
                if t < addr:
                    addr_queue.append(t)
                body.append((addr, mnem, ins.op_str,
                             " ".join("%02x" % b for b in ins.bytes)))
                break
            elif mnem in COND and ops_imms:
                addr_queue.append(ops_imms[0] & 0xFFFF)

            # Track data immediates (mov/lea/push/cmp etc).
            if mnem in ("mov", "lea", "push", "movzx", "cmp", "test", "or",
                        "and", "xor", "add", "sub"):
                for v in ops_imms:
                    data_imms.add(v & 0xFFFF)

            body.append((addr, mnem, ins.op_str,
                         " ".join("%02x" % b for b in ins.bytes)))

            if mnem in ("ret", "retf", "iret"):
                break
            addr += ins.size
    return {
        "size": sum(len(b[3].split()) for b in body),
        "ints": sorted(ints),
        "near_calls": sorted(near_calls),
        "far_calls": sorted(far_calls),
        "data_imms": sorted(data_imms),
        "body": sorted(body, key=lambda r: r[0]),
    }

# Drive the recursive trace
while queue:
    e = queue.pop()
    if e in seen_entries: continue
    seen_entries.add(e)
    if e >= len(load): continue
    functions[e] = disassemble_function(e)

# ---------------------------------------------------------------------------
# Build callers map
# ---------------------------------------------------------------------------
callers = defaultdict(set)
for ent, info in functions.items():
    for t in info["near_calls"]:
        callers[t].add(ent)

# ---------------------------------------------------------------------------
# Locate the data segment by matching immediates against known frag offsets
# ---------------------------------------------------------------------------
frags = json.loads((EXE.parent / "assets" / "screens_raw.json").read_text())
all_data_imms = set()
for info in functions.values():
    all_data_imms.update(info["data_imms"])

# Get distinct relocation-fixed segment immediates as DGROUP candidates
n_relocs = struct.unpack("<H", d[6:8])[0]
reloc_off = struct.unpack("<H", d[24:26])[0]
seg_imms = set()
for i in range(n_relocs):
    off, seg = struct.unpack("<HH", d[reloc_off + i * 4 : reloc_off + i * 4 + 4])
    file_loc = HDR + seg * 16 + off
    if file_loc + 2 > len(d): continue
    seg_imms.add(struct.unpack("<H", d[file_loc:file_loc+2])[0])

best = (0, 0)
for seg in seg_imms:
    base = seg * 16
    hits = sum(1 for f in frags
               if 0 <= f["file_offset"] - HDR - base <= 0xFFFF
               and (f["file_offset"] - HDR - base) in all_data_imms)
    if hits > best[1]:
        best = (seg, hits)

# Direct match (frag offsets used as immediates without segment relocation):
direct = sum(1 for f in frags if (f["file_offset"] - HDR) in all_data_imms)
print(f"Best DGROUP candidate: seg=0x{best[0]:04X}  matches={best[1]}/{len(frags)}")
print(f"Direct match (same segment as code): {direct}/{len(frags)}")

# Use whichever is higher
use_seg, hits = best if best[1] >= direct else (0, direct)
base = use_seg * 16
print(f"Using base=0x{base:06X} ({'seg ' + hex(use_seg) if use_seg else 'same segment'})")

# Build xref list
xrefs = []
frag_by_rel = {(f["file_offset"] - HDR - base) & 0xFFFF: f for f in frags
               if 0 <= f["file_offset"] - HDR - base <= 0xFFFF}
for ent, info in functions.items():
    for addr, mnem, ops, hx in info["body"]:
        # extract imms from operand string (simplified)
        for token in ops.replace(",", " ").split():
            if token.startswith("0x"):
                try:
                    v = int(token, 16) & 0xFFFF
                except ValueError:
                    continue
                if v in frag_by_rel:
                    f = frag_by_rel[v]
                    xrefs.append((ent, addr, mnem, ops, f["file_offset"], f["text"][:60]))

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------
with open(OUT / "functions.txt", "w") as f:
    f.write(f"# {len(functions)} functions reachable from entry 0x{ENTRY:06X}\n")
    f.write(f"# entry  file_offset  size  ints      calls  far_calls    callers\n")
    for ent, info in sorted(functions.items(), key=lambda kv: -kv[1]["size"]):
        ints = ",".join("INT%02X" % i for i in info["ints"]) or "-"
        far = ",".join(f"{s:04X}:{o:04X}" for o, s in info["far_calls"][:4]) or "-"
        ncallers = len(callers.get(ent, ()))
        f.write(f"0x{ent:06X}  file=0x{HDR+ent:06X}  sz={info['size']:5d}  "
                f"{ints:12s}  calls={len(info['near_calls']):3d}  far={far:25s}  "
                f"callers={ncallers}\n")

with open(OUT / "xrefs_data.txt", "w") as f:
    f.write(f"# Using data base = 0x{base:06X} ({len(xrefs)} hits)\n")
    by_frag = defaultdict(list)
    for ent, addr, mnem, ops, fo, txt in xrefs:
        by_frag[fo].append((ent, addr, mnem, ops, txt))
    for fo in sorted(by_frag):
        sample = by_frag[fo][0]
        f.write(f"\nfrag @ 0x{fo:06X}  {sample[4]!r}\n")
        for ent, addr, mnem, ops, txt in by_frag[fo]:
            f.write(f"  drawn by fn 0x{ent:06X} @ instr 0x{addr:06X}  {mnem} {ops}\n")

with open(OUT / "disasm.txt", "w") as f:
    for ent, info in sorted(functions.items(), key=lambda kv: kv[0]):
        if info["size"] < 4: continue
        ints = ",".join("INT%02X" % i for i in info["ints"]) or "-"
        f.write(f"\n; === function 0x{ent:06X} (file=0x{HDR+ent:06X}) "
                f"size={info['size']} ints={ints} callers={len(callers.get(ent,()))} ===\n")
        for addr, mnem, ops, hx in info["body"]:
            f.write(f"0x{addr:06X}:  {hx:18s}  {mnem} {ops}\n")

print(f"  functions: {len(functions)}")
print(f"  total ints found: {sum(len(i['ints']) for i in functions.values())}")
print(f"  far-call targets: {sorted(set((s,o) for i in functions.values() for o,s in i['far_calls']))[:10]}")
print(f"  xrefs to frags:   {len(xrefs)} ({len(set(x[4] for x in xrefs))} distinct frags)")
