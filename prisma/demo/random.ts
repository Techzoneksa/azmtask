/**
 * Deterministic pseudo-randomness.
 *
 * The demo must be reproducible: re-seeding next month has to produce the same
 * hotel, or the acceptance tests are asserting against a moving target and any
 * bug found today cannot be reproduced tomorrow. So nothing here calls
 * Math.random — every "random" choice comes from a fixed seed.
 *
 * mulberry32: small, fast, and good enough for picking names and rates.
 */
export function createRandom(seed: number) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Integer in [min, max], both inclusive. */
    int(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)];
    },
    /** True with the given probability. */
    chance(probability: number): boolean {
      return next() < probability;
    },
    /**
     * Picks from a weighted list. Used so reservation sources and statuses come
     * out unevenly, the way a real hotel's do, rather than uniformly.
     */
    weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    /** Fisher-Yates, returning a new array. */
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

export type Random = ReturnType<typeof createRandom>;
