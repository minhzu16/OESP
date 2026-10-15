/**
 * Deterministic PRNG (mulberry32). Given the attempt seed, question draw and
 * option shuffles are reproducible — the same idea as quiz-app's
 * `Random(Object.hash(sessionId, questionId))`, but we also persist the result.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle returning a new array. */
export function seededShuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Derives a stable sub-seed (e.g. per question) from a base seed and a string. */
export function deriveSeed(base: number, salt: string): number {
  let h = base >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
