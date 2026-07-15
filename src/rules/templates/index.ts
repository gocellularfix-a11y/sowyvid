import { Template } from '@shared/domain/template'
import { BUILTIN_TEMPLATES } from './builtins'

// Validate every built-in template against the schema at module load. A malformed
// template is a programmer error and should fail loudly, immediately.
const validated: Template[] = BUILTIN_TEMPLATES.map((t) => Template.parse(t))
const byId = new Map(validated.map((t) => [t.id, t]))

export function listTemplates(): Template[] {
  return validated
}

export function getTemplate(id: string): Template | undefined {
  return byId.get(id)
}

/** Throwing accessor for internal code paths that require a known template. */
export function requireTemplate(id: string): Template {
  const t = byId.get(id)
  if (!t) throw new Error(`Unknown template: ${id}`)
  return t
}

export { BUILTIN_TEMPLATES }
