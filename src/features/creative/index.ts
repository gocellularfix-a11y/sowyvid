/**
 * The SowyVid ↔ Northstar creative-engine boundary. The app imports ONLY from
 * here; it never reaches into the engine package directly except through these
 * adapters. See docs/CREATIVE-ENGINE-INTEGRATION.md.
 */
export {
  developProjectConcepts,
  findProjectConcept,
  compileProjectConcept,
  toRendererPlan,
  projectAssetResolver,
  type CompiledConcept,
} from './service'
export { listCreativeFamilies, type CreativeFamilyInfo } from './families'
export { toEngineMedia } from './mediaAdapter'
export { projectToDirectorInput, projectToContent } from './projectToCreativeInput'
export {
  creativePlanToRenderer,
  type SowyvidRendererPlan,
  type SowyvidRendererScene,
  type ResolvedMediaRef,
  type AssetResolver,
} from './creativePlanToRenderer'
