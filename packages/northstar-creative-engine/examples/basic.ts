import {
  adaptRenderPlan,
  compileCreativePlan,
  developConcepts,
  evaluatePlanDiversity,
  serializeCreativePlan,
} from '../src/index.js';
import { remotionAdapter } from '../src/adapters/remotion.js';

const input = {
  businessName: 'Example Store',
  productOrService: 'Certified phones',
  offer: 'Save $100 this week',
  locale: 'en' as const,
  platformIntent: 'vertical_social' as const,
  media: [
    { id: 'phone-front', kind: 'image' as const, roles: ['product' as const], orientation: 'portrait' as const, qualityScore: 0.9 },
    { id: 'phone-demo', kind: 'video' as const, roles: ['process' as const], orientation: 'portrait' as const, durationSec: 8, qualityScore: 0.85 },
    { id: 'happy-customer', kind: 'image' as const, roles: ['proof' as const, 'person' as const], orientation: 'portrait' as const, qualityScore: 0.8 },
    { id: 'brand-logo', kind: 'logo' as const, roles: ['logo' as const], orientation: 'square' as const, qualityScore: 1 },
  ],
};

const concepts = developConcepts(input, 3);
console.log(evaluatePlanDiversity(concepts));
console.log(serializeCreativePlan(concepts[0]!));

const renderPlan = compileCreativePlan({
  plan: concepts[0]!,
  content: {
    businessName: input.businessName,
    productOrService: input.productOrService,
    offer: input.offer,
    callToAction: 'Visit us today',
    locale: input.locale,
  },
});

const remotionInputProps = adaptRenderPlan(renderPlan, remotionAdapter);
console.log(remotionInputProps);
