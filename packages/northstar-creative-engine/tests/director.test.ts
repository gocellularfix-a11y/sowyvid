import { describe, expect, it } from 'vitest';
import { developAllConcepts, developConcepts } from '../src/director.js';
import { serializeCreativePlan } from '../src/contracts.js';

const input = {
  businessName: 'Go Cellular',
  productOrService: 'certified smartphones',
  offer: 'save $100 this week',
  locale: 'en' as const,
  seed: 'fixed-seed',
  platformIntent: 'vertical_social' as const,
};

describe('deterministic director', () => {
  it('returns different families before additional variants', () => {
    const plans = developConcepts(input, 5);
    expect(new Set(plans.map((plan) => plan.family)).size).toBe(5);
  });

  it('provides fifteen deterministic concepts instead of only five fixed recipes', () => {
    const plans = developAllConcepts(input);
    expect(plans).toHaveLength(15);
    expect(new Set(plans.map((plan) => plan.conceptId)).size).toBe(15);
  });

  it('is reproducible for the same input and seed', () => {
    const first = developConcepts(input, 8).map(serializeCreativePlan);
    const second = developConcepts(input, 8).map(serializeCreativePlan);
    expect(second).toEqual(first);
  });

  it('supports show-more exclusions', () => {
    const first = developConcepts(input, 3);
    const next = developConcepts(input, 3, first.map((plan) => plan.conceptId));
    expect(next).toHaveLength(3);
    expect(next.every((plan) => !first.some((old) => old.conceptId === plan.conceptId))).toBe(true);
  });
});
