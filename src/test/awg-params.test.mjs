import { expect, test } from 'vitest';

const MTU = 1280;
const S1_MAX_MTU = MTU - 148;
const S2_MAX_MTU = MTU - 92;
const randomInt = (min, max) => {
  const range = max - min + 1;
  return Math.floor(Math.random() * range) + min;
};

// mirrors generateAwgObfuscationParams from server/utils/awg-params.ts
function generate() {
  const jc = randomInt(4, 128);
  const jmin = randomInt(8, 127);
  const jmax = randomInt(Math.max(jmin + 1, 60), 1280);
  const s1 = randomInt(0, S1_MAX_MTU);
  let s2 = randomInt(0, S2_MAX_MTU);
  while (s2 === s1 + 56) {
    s2 = randomInt(0, S2_MAX_MTU);
  }
  return { jc, jmin, jmax, s1, s2 };
}

test('jmax always greater than jmin', () => {
  for (let i = 0; i < 5000; i++) {
    const p = generate();
    expect(p.jmax).toBeGreaterThan(p.jmin);
  }
});

test('s2 never equals s1 + 56 (initiation/response size collision)', () => {
  for (let i = 0; i < 5000; i++) {
    const p = generate();
    expect(p.s2).not.toBe(p.s1 + 56);
  }
});

test('sizes respect MTU limits', () => {
  for (let i = 0; i < 5000; i++) {
    const p = generate();
    expect(p.s1).toBeLessThanOrEqual(S1_MAX_MTU);
    expect(p.s2).toBeLessThanOrEqual(S2_MAX_MTU);
    expect(p.jc).toBeGreaterThanOrEqual(4);
    expect(p.jmax).toBeLessThanOrEqual(MTU);
  }
});
