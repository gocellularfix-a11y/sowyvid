import { describe, expect, it } from 'vitest';
import { adaptRenderPlan } from '../src/adapters.js';
import { remotionAdapter } from '../src/adapters/remotion.js';
import { compileCreativePlan } from '../src/compiler.js';
import { developConcepts } from '../src/director.js';

 describe('generic compilation', () => {
  it('creates a renderer-neutral timeline and Remotion input props', () => {
    const plan = developConcepts({
      businessName: 'Go Cellular',
      productOrService: 'certified phones',
      offer: 'save $100',
      locale: 'en',
      platformIntent: 'vertical_social',
    }, 1)[0]!;
    const renderPlan = compileCreativePlan({
      plan,
      content: {
        businessName: 'Go Cellular',
        productOrService: 'certified phones',
        offer: 'save $100',
        callToAction: 'Visit Go Cellular today',
        locale: 'en',
      },
    });
    expect(renderPlan.durationSec).toBeCloseTo(plan.targetDurationSec, 6);
    expect(renderPlan.scenes.at(-1)?.role).toBe('cta');
    const props = adaptRenderPlan(renderPlan, remotionAdapter);
    expect(props.width).toBe(1080);
    expect(props.height).toBe(1920);
    expect(props.durationInFrames).toBeGreaterThan(0);
    expect(props.scenes.at(-1)?.copy.headline).toBe('Visit Go Cellular today');
  });
});
