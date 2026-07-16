import type { CommercialRenderPlan } from './contracts.js';

/** A renderer adapter maps the neutral timeline into any concrete platform. */
export interface RendererAdapter<TOutput> {
  readonly id: string;
  adapt(plan: CommercialRenderPlan): TOutput;
}

export function adaptRenderPlan<TOutput>(
  plan: CommercialRenderPlan,
  adapter: RendererAdapter<TOutput>,
): TOutput {
  return adapter.adapt(plan);
}
