#!/usr/bin/env python3
# PyGhidra driver — replaces the old analyzeHeadless/Jython post-script
# (Ghidra 12.1 dropped the bundled Jython; .py scripts now run via PyGhidra).
#
# Run via the repo's dedicated venv (see notes/findings.md "Ghidra" section):
#   GHIDRA_INSTALL_DIR=/opt/homebrew/Cellar/ghidra/12.1/libexec \
#   JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
#   .venv-ghidra/bin/python tools/pyghidra_dump.py
#
# Imports GOPNIK.EXE into a throwaway project, runs auto-analysis, then dumps:
#   notes/ghidra_functions.txt   one line per function with name/addr/size/calls/INTs
#   notes/ghidra_decomp.txt      C decompilation of every function < 4 KB
#   notes/ghidra_strings.txt     defined strings with xref counts/callers

import os
import tempfile

import pyghidra

pyghidra.start()

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BINARY = os.path.join(REPO, "GOPNIK.EXE")
OUT_DIR = os.path.join(REPO, "notes")
PROJ_DIR = tempfile.mkdtemp(prefix="gopnik_pyghidra_")


def fn_calls_int(fn, listing, nums=(0x10, 0x16, 0x21, 0x33)):
    """Return the set of INT numbers called inside this function."""
    found = set()
    it = listing.getInstructions(fn.getBody(), True)
    while it.hasNext():
        ins = it.next()
        if ins.getMnemonicString() != "INT":
            continue
        ops = ins.getOpObjects(0)
        if ops and hasattr(ops[0], "getValue"):
            try:
                v = int(ops[0].getValue())
                if v in nums:
                    found.add(v)
            except Exception:
                pass
        else:
            s = str(ins).lower()
            for n in nums:
                if "0x%x" % n in s or "%xh" % n in s:
                    found.add(n)
    return found


def dump(program):
    from ghidra.app.decompiler import DecompInterface
    from ghidra.util.task import ConsoleTaskMonitor

    listing = program.getListing()
    fm = program.getFunctionManager()
    rm = program.getReferenceManager()
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
        ncallers = len(list(rm.getReferencesTo(fn.getEntryPoint())))
        called = set()
        instrs = listing.getInstructions(body, True)
        while instrs.hasNext():
            ins = instrs.next()
            for ref in ins.getReferencesFrom():
                if ref.getReferenceType().isCall():
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
        f.write("# %d functions (PyGhidra auto-analysis of GOPNIK.EXE)\n" % len(fns))
        f.write("# name  entry  size  callers  INTs  num_called\n")
        for r in fns:
            ints = ",".join("INT%02Xh" % i for i in r["ints"]) or "-"
            f.write("%-30s %-12s sz=%-5d callers=%-3d %-25s calls=%d\n" % (
                r["name"], r["entry"], r["size"], r["callers"], ints, len(r["called"])))

    af = program.getAddressFactory()
    with open(os.path.join(OUT_DIR, "ghidra_decomp.txt"), "w") as f:
        for r in fns:
            if r["size"] > 12000:  # decompile gameplay fns; skip only the 17KB Borland-startup `entry`
                f.write("// %s @ %s  size=%d  SKIPPED (too big)\n\n" % (r["name"], r["entry"], r["size"]))
                continue
            if r["size"] < 4:
                continue
            fn = fm.getFunctionAt(af.getAddress(r["entry"]))
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

    data_it = listing.getDefinedData(True)
    out = []
    while data_it.hasNext():
        d = data_it.next()
        v = d.getValue()
        if v is None:
            continue
        s = str(v)
        if not s:
            continue
        if d.getDataType().getName() not in ("string", "TerminatedCString", "char"):
            continue
        if len(s) < 4:
            continue
        nrefs = 0
        callers = []
        for r in rm.getReferencesTo(d.getAddress()):
            nrefs += 1
            cf = fm.getFunctionContaining(r.getFromAddress())
            callers.append("%s@%s" % (cf.getName() if cf else "?", r.getFromAddress()))
        out.append((str(d.getAddress()), s, nrefs, callers))
    out.sort(key=lambda r: -r[2])

    with open(os.path.join(OUT_DIR, "ghidra_strings.txt"), "w") as f:
        f.write("# %d defined strings, sorted by xref count\n" % len(out))
        for addr, s, nrefs, callers in out:
            f.write("%s  refs=%d  %r\n" % (addr, nrefs, s[:80]))
            for c in callers[:5]:
                f.write("    <- %s\n" % c)

    print("dumped %d functions, %d strings" % (len(fns), len(out)))


with pyghidra.open_program(BINARY, project_location=PROJ_DIR,
                           project_name="gopnik_dump", analyze=True) as flat_api:
    dump(flat_api.getCurrentProgram())
