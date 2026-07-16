import { describe, expect, it } from 'vitest';
import { developConcepts } from '../src/director.js';
import { evaluatePlanDiversity } from '../src/diversity.js';

 describe('plan diversity', () => {
  it('checks actual structure, duration, motion and media sequences', () => {
    const plans = developConcepts({
      businessName: 'Store',
      productOrService: 'new phone sale',
      offer: '20 percent off',
      locale: 'en',
      seed: 'diversity',
      platformIntent: 'vertical_social',
    }, 3);
    const report = evaluatePlanDiversity(plans, { threshold: 0.35 });
    expect(report.ok).toBe(true);
    expect(report.pairs[0]?.dimensions.some((dimension) => dimension.dimension === 'durationPattern')).toBe(true);
    expect(report.pairs[0]?.dimensions.some((dimension) => dimension.dimension === 'motionSequence')).toBe(true);
  });
});
