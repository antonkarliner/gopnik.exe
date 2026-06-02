// Borland C++ 3.1 rand() reproduction.
//
// Borland's rand() / srand() use a 32-bit linear-congruential generator:
//   seed = seed * 0x015A4E35 + 1
//   rand() returns (seed >> 16) & 0x7FFF
// This implementation is bit-exact with the original on every value
// from any starting seed, so a port driven by the same seed and the
// same input sequence produces identical outcomes.
//
// Phase 1 confirms the seed source: Borland C runtime initializes
// `_randseed` to 1 unless `srand(time(NULL))` is called; the calls to
// INT 21h AH=2C (get-time) found in the binary suggest time-based
// seeding.

const A = 0x015A4E35;

export class Rand {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
  }

  next() {
    // 32-bit unsigned multiply-add. JS bit-ops are 32-bit signed; use
    // Math.imul for the low 32 bits of a 32x32 multiply.
    const lo = Math.imul(this.seed, A) >>> 0;
    this.seed = (lo + 1) >>> 0;
    return (this.seed >>> 16) & 0x7FFF;
  }

  // Borland's rand() % n is uniform-ish but biased; reproduce verbatim.
  range(n) { return this.next() % n; }
}
