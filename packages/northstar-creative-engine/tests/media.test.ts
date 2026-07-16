import { describe, expect, it } from 'vitest';
import { assignMediaToScenes } from '../src/media.js';
import type { SceneDirective } from '../src/contracts.js';

const baseScene: SceneDirective = {
  role: 'cta',
  beatPurpose: 'cta',
  shotBehavior: 'static',
  motion: 'clean_fade',
  transitionIn: 'clean_fade',
  textDensity: 'low',
  holdBias: 1,
  durationSec: 2,
  mediaSlots: ['logo'],
  assignedMedia: [],
  emphasis: 'cta',
};

describe('media assignment', () => {
  it('does not put a random product photo into a logo slot', () => {
    const result = assignMediaToScenes([
      baseScene,
    ], [
      { id: 'phone', kind: 'image', roles: ['product'], orientation: 'portrait', qualityScore: 1, tags: [] },
    ], 'vertical_social', 'seed');
    expect(result.scenes[0]?.assignedMedia).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/logo/);
  });

  it('prefers an actual logo for a CTA logo slot', () => {
    const result = assignMediaToScenes([
      baseScene,
    ], [
      { id: 'phone', kind: 'image', roles: ['product'], orientation: 'portrait', qualityScore: 1, tags: [] },
      { id: 'logo', kind: 'logo', roles: ['logo'], orientation: 'square', qualityScore: 0.7, tags: [] },
    ], 'vertical_social', 'seed');
    expect(result.scenes[0]?.assignedMedia[0]?.assetId).toBe('logo');
  });
});
