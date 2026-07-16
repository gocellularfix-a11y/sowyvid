import { describe, expect, it } from 'vitest';
import { classifyPromotion } from '../src/classification.js';

 describe('promotion classification', () => {
  it('supports Portuguese signals', () => {
    const result = classifyPromotion({
      businessName: 'Assistência Central',
      productOrService: 'conserto de tela quebrada com garantia',
      offer: 'promoção hoje',
      locale: 'pt',
    });
    expect(result.category).toBe('repair');
    expect(result.scores.repair ?? 0).toBeGreaterThan(result.scores.retail_offer ?? 0);
  });

  it('scores all matches instead of returning the first keyword match', () => {
    const result = classifyPromotion({
      productOrService: 'professional certified service with warranty and customer reviews',
      locale: 'en',
      objective: 'build_trust',
    });
    expect(result.category).toBe('service_trust');
    expect(result.reasons.length).toBeGreaterThan(1);
  });
});
