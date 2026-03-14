// ─── Shared CKKS Parameters ────────────────────────────────────────────────
//
// Single source of truth for CKKS encryption parameters.
// Used by both client (ckks-worker.ts) and server (seal-aggregator.ts).

/** Polynomial modulus degree — determines slot count (N/2 = 4096 slots). */
export const POLY_MODULUS_DEGREE = 8192

/** Coefficient modulus bit sizes — determines precision and multiplication depth. */
export const COEFF_MOD_BIT_SIZES = [60, 40, 40, 60] as const

/** Encoding scale — 2^40, matching the 40-bit middle primes. */
export const CKKS_SCALE = Math.pow(2, 40)
