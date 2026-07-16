import { describe, expect, it } from 'vitest';
import { distributeBeatDurations, getPacingProfile } from '../src/pacing.js';

 describe('bounded pacing allocation', () => {
  it('keeps social-fast scenes inside their limits and totals exactly 15 seconds', () => {
    const profile = getPacingProfile('social_fast');
    const durations = distributeBeatDurations([0.7, 1.1, 0.8, 0.8, 0.8, 1], profile);
    expect(durations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(15, 6);
    expect(Math.min(...durations)).toBeGreaterThanOrEqual(profile.minSceneSec);
    expect(Math.max(...durations)).toBeLessThanOrEqual(profile.maxSceneSec);
  });

  it('rejects impossible targets instead of violating bounds', () => {
    const profile = getPacingProfile('social_fast');
    expect(() => distributeBeatDurations([1, 1, 1], profile, { targetDurationSec: 20 })).toThrow(/infeasible/);
  });
});
