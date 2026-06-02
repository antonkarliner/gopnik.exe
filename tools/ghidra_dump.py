# ⚠️ SUPERSEDED by tools/pyghidra_dump.py (Session 26). Ghidra 12.1 dropped the
# bundled Jython, so this analyzeHeadless/Jython post-script no longer runs.
# Kept for reference only — use the PyGhidra driver instead.
#
# Ghidra headless post-script. Run via:
#   analyzeHeadless <proj> gopnik -process GOPNIK.EXE -postScript tools/ghidra_dump.py -scriptPath tools
#
# Dumps:
#   notes/ghidra_functions.txt   one line per function with name/addr/size/calls/INTs
#   notes/ghidra_decomp.txt      C decompilation of every function < 4 KB
#   notes/ghidra_strings.txt     strings with xref counts/callers
#
# This script is Jython 2.7 (Ghidra's embedded interpreter).
# @category gopnik

import os

from ghidra.app.decompiler import DecompInterface
from ghidra.util.task import ConsoleTaskMonitor

OUT_DIR = "/Users/antonkarliner/GitHub/gopnik/notes"

def fn_calls_int(fn, listing, nums=(0x10, 0x16, 0x21, 0x33)):
    """Return the set of INT numbers called inside this function."""
    found = set()
    body = fn.getBody()
    addr = body.getMinAddress()
    end = body.getMaxAddress()
    it = listing.getInstructions(body, True)
    while it.hasNext():
        ins = it.next()
        if ins.getMnemonicString() != "INT":
            continue
        ops = ins.getOpObjects(0)
        if ops and hasattr(ops[0], 'getValue'):
            try:
                v = int(ops[0].getValue())
                if v in nums:
                    found.add(v)
            except Exception:
                pass
        else:
            # Fallback: parse from string repr
            s = str(ins).lower()
            for n in nums:
                if "0x%x" % n in s or "%xh" % n in s:
                    found.add(n)
    return found

def main():
    program = currentProgram
    listing = program.getListing()
    fm = program.getFunctionManager()

    decomp = DecompInterface()
    decomp.openProgram(program)
    monitor = ConsoleTaskMonitor()

    fns = []
    it = fm.getFunctions(True)
    while it.hasNext():
        fn = it.next()
        body = fn.getBody()
        size = body.getNumAddresses()
        ints = fn_calls_int(fn, listing)
        # callers
        callers = fm.getReferencesTo(fn.getEntryPoint())
        ncallers = 0
        try:
            ncallers = len([r for r in fm.getReferencesTo(fn.getEntryPoint())])
        except Exception:
            ncallers = 0
        # called functions
        called = set()
        instrs = listing.getInstructions(body, True)
        while instrs.hasNext():
            ins = instrs.next()
            for ref in ins.getReferencesFrom():
                rt = ref.getReferenceType()
                if rt.isCall():
                    called.add(str(ref.getToAddress()))
        fns.append({
            "name": fn.getName(),
            "entry": str(fn.getEntryPoint()),
            "size": size,
            "ints": sorted(ints),
            "callers": ncallers,
            "called": sorted(called),
        })

    fns.sort(key=lambda f: -f["size"])

    with open(os.path.join(OUT_DIR, "ghidra_functions.txt"), "w") as f:
        f.write("# name  entry  size  callers  INTs  num_called\n")
        for r in fns:
            ints = ",".join("INT%02Xh" % i for i in r["ints"]) or "-"
            f.write("%-30s %-12s sz=%-5d callers=%-3d %-25s calls=%d\n" % (
                r["name"], r["entry"], r["size"], r["callers"], ints, len(r["called"])))

    # Decompile non-trivial functions
    with open(os.path.join(OUT_DIR, "ghidra_decomp.txt"), "w") as f:
        for r in fns:
            if r["size"] > 4096:
                f.write("// %s @ %s  size=%d  SKIPPED (too big)\n\n" % (r["name"], r["entry"], r["size"]))
                continue
            if r["size"] < 4:
                continue
            fn = fm.getFunctionAt(program.getAddressFactory().getAddress(r["entry"]))
            if not fn:
                continue
            try:
                res = decomp.decompileFunction(fn, 30, monitor)
                if res and res.getDecompiledFunction():
                    c = res.getDecompiledFunction().getC()
                    f.write("// %s @ %s  size=%d  INTs=%s callers=%d\n" % (
                        r["name"], r["entry"], r["size"], r["ints"], r["callers"]))
                    f.write(c)
                    f.write("\n// ---\n\n")
                else:
                    f.write("// %s @ %s  decompile failed\n\n" % (r["name"], r["entry"]))
            except Exception as e:
                f.write("// %s @ %s  decompile error %s\n\n" % (r["name"], r["entry"], e))

    # Strings with xrefs
    rm = program.getReferenceManager()
    listing2 = program.getListing()
    data_it = listing2.getDefinedData(True)
    out = []
    while data_it.hasNext():
        d = data_it.next()
        v = d.getValue()
        if v is None:
            continue
        s = str(v)
        if not s or not isinstance(s, str):
            continue
        if d.getDataType().getName() not in ("string", "TerminatedCString", "char"):
            continue
        if len(s) < 4:
            continue
        refs = rm.getReferencesTo(d.getAddress())
        nrefs = 0
        callers = []
        for r in refs:
            nrefs += 1
            f = fm.getFunctionContaining(r.getFromAddress())
            callers.append("%s@%s" % (f.getName() if f else "?", r.getFromAddress()))
        out.append((d.getAddress(), s, nrefs, callers))

    out.sort(key=lambda r: -r[2])
    with open(os.path.join(OUT_DIR, "ghidra_strings.txt"), "w") as f:
        for addr, s, nrefs, callers in out:
            f.write("%s  refs=%d  %r\n" % (addr, nrefs, s[:80]))
            for c in callers[:5]:
                f.write("    <- %s\n" % c)
    print("dumped %d functions" % len(fns))

main()
