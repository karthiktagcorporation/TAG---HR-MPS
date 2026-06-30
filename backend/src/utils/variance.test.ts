import { describe, expect, it } from 'vitest';
import { computeExcess, computeShortage, variance } from './variance';

describe('variance math', () => {
  it('computes shortage when actual is below plan', () => {
    expect(computeShortage(20, 15)).toBe(5);
  });

  it('returns 0 shortage when actual meets or exceeds plan', () => {
    expect(computeShortage(20, 25)).toBe(0);
    expect(computeShortage(20, 20)).toBe(0);
  });

  it('computes excess when actual exceeds plan', () => {
    expect(computeExcess(20, 25)).toBe(5);
  });

  it('returns 0 excess when actual is at or below plan', () => {
    expect(computeExcess(20, 18)).toBe(0);
  });

  it('never reports both shortage and excess simultaneously', () => {
    const v = variance(20, 14);
    expect(v.shortage).toBe(6);
    expect(v.excess).toBe(0);
  });
});
