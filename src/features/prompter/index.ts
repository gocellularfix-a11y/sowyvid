/**
 * The provider-neutral Commercial Prompter. Pure and isomorphic: the same
 * deterministic intelligence runs in the browser preview, the demo script, unit
 * tests and (behind IPC) the desktop app. PromptGate adds an optional AI layer
 * that can only ever improve wording — never mint a product fact.
 */
export { buildCommercialPlan, type BuildPlanOptions } from './planBuilder'
export { regenerateForFacts, surviveableLayoutSceneIds, type RegenerateResult } from './regenerator'
export { parseCommercialRequest, detectProduct, extractOwnerFacts } from './intentParser'
export { resolveFacts, hasClaimableFact, factValue, type ResolvedFacts } from './factResolver'
export { selectSalesAngle, PRICE_ANGLES, PROMO_ANGLES } from './salesAngle'
export { planScenes, type PlannedScene } from './copywriter'
export { buildStoryboard, generatedVideoScenes } from './storyboard'
export { buildShotInstruction, buildVideoPrompt, toViduPrompt, FORBIDDEN } from './videoPrompt'
export {
  validateCommercialPlanContent,
  scanUnsupportedClaims,
} from './validator'
export {
  sanitizeCreativeRequest,
  applyProposal,
  registerTextAIProvider,
  getTextAIProvider,
  availableTextAIProviders,
  DeterministicFallbackProvider,
  CreativeRequest,
  AIProposal,
  type TextAIProvider,
  type ApplyProposalResult,
} from './promptGate'
