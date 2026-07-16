import { describe, expect, it } from 'vitest';
import { CreativePlanSchema, serializeCreativePlan, validateCreativePlan } from '../src/contracts.js';
import { developConcepts } from '../src/director.js';

const input = {
  businessName: 'Go Cellular',
  productOrService: 'certified phones',
  offer: 'save $100',
  locale: 'en' as const,
  platformIntent: 'vertical_social' as const,
};

describe('creative plan contract', () => {
  it('serializes nested scene objects canonically instead of replacing them with empty objects', () => {
    const plan = developConcepts(input, 1)[0]!;
    const parsed = JSON.parse(serializeCreativePlan(plan)) as { scenes: Array<Record<string, unknown>> };
    expect(parsed.scenes[0]).toHaveProperty('beatPurpose');
    expect(Object.keys(parsed.scenes[0] ?? {})).not.toHaveLength(0);
    expect(serializeCreativePlan(plan)).toBe(serializeCreativePlan(CreativePlanSchema.parse(plan)));
  });

  it('requires the final scene, not merely any scene, to be the CTA', () => {
    const plan = developConcepts(input, 1)[0]!;
    const invalid = structuredClone(plan);
    const final = invalid.scenes.pop()!;
    invalid.scenes.splice(1, 0, final);
    invalid.storyStructure = invalid.scenes.map((scene) => scene.beatPurpose);
    const result = validateCreativePlan(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/final scene must be a cta/i);
  });
});
