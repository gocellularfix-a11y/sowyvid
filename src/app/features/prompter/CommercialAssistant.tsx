import { useMemo, useState } from 'react'
import { Icon } from '../../ui/Icon'
import { Button } from '../../ui/Button'
import { TextArea } from '../../ui/TextInput'
import { Modal } from '../../ui/Modal'
import { useToast } from '../../ui/toastContext'
import { getBridge, isBrowserPreview } from '../../bridge'
import {
  buildCommercialPlan,
  regenerateForFacts,
  sanitizeCreativeRequest,
  availableTextAIProviders,
} from '@features/prompter'
import type { CommercialPlan, ProductFact } from '@shared/domain/commercialPlan'
import { copy } from '../../content/copy'
import styles from './CommercialAssistant.module.css'

/**
 * The editable, fact-safe commercial-plan screen. The owner writes a plain goal;
 * SowyVid shows the detected product, the facts to confirm, the recommended
 * angle, editable narration/overlays, the visual plan and any suggested external
 * clip — no JSON, schemas or ids exposed. Everything is deterministic (no AI,
 * no network); the AI action only ever shows the exact text that WOULD be sent.
 */

const CATEGORY_TO_BRIEF: Record<string, string> = {
  phone: 'phone-electronics',
  electronics: 'phone-electronics',
  service: 'local-service',
  food: 'restaurant-food',
  product: 'retail-product',
  other: 'other',
}

interface FactField {
  key: string
  label: string
  value: string
}

export function CommercialAssistant({
  onCreated,
}: {
  onCreated: (projectId: string, name: string) => void
}): JSX.Element {
  const toast = useToast()
  const [text, setText] = useState('')
  const [plan, setPlan] = useState<CommercialPlan | null>(null)
  const [factFields, setFactFields] = useState<FactField[]>([])
  const [sceneEdits, setSceneEdits] = useState<Record<string, { spoken?: string; overlay?: string }>>({})
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const aiAvailable = availableTextAIProviders().length > 0

  /** The plan actually shown/persisted: base plan with the owner's scene edits. */
  const displayed = useMemo<CommercialPlan | null>(() => {
    if (!plan) return null
    return {
      ...plan,
      narrationScenes: plan.narrationScenes.map((s) => {
        const e = sceneEdits[s.sceneId]
        return e ? { ...s, spokenText: e.spoken ?? s.spokenText, overlayText: e.overlay ?? s.overlayText } : s
      }),
    }
  }, [plan, sceneEdits])

  const analyze = (): void => {
    if (!text.trim()) return
    const built = buildCommercialPlan({ text: text.trim(), locale: 'es' })
    setPlan(built)
    setSceneEdits({})
    // Seed the fact fields: confirmed facts (editable) + missing facts (empty).
    const fields: FactField[] = [
      ...built.knownFacts.map((f) => ({ key: f.key, label: f.label, value: f.value })),
      ...built.missingFacts.map((m) => ({ key: m.key, label: m.label, value: '' })),
    ]
    setFactFields(fields)
  }

  const ownerFactsFrom = (fields: FactField[]): ProductFact[] =>
    fields
      .filter((f) => f.value.trim().length > 0)
      .map((f) => ({ key: f.key, label: f.label, value: f.value.trim(), source: 'owner_provided' as const, confidence: 'high' as const, claimable: true }))

  /** A fact edit regenerates only the affected copy; scene edits are preserved. */
  const onFactChange = (key: string, value: string): void => {
    const next = factFields.map((f) => (f.key === key ? { ...f, value } : f))
    setFactFields(next)
    if (!plan) return
    const { plan: regen, revision } = regenerateForFacts(plan, ownerFactsFrom(next))
    setPlan(regen)
    // Drop scene edits whose scene disappeared.
    if (revision.droppedLayoutKeys.length > 0) {
      setSceneEdits((prev) => {
        const copy2 = { ...prev }
        for (const id of revision.droppedLayoutKeys) delete copy2[id]
        return copy2
      })
    }
  }

  const editScene = (sceneId: string, patch: { spoken?: string; overlay?: string }): void => {
    setSceneEdits((prev) => ({ ...prev, [sceneId]: { ...prev[sceneId], ...patch } }))
  }

  const create = async (): Promise<void> => {
    if (!displayed || isBrowserPreview) {
      if (isBrowserPreview) toast.show('El asistente está disponible en la app de escritorio.', 'info')
      return
    }
    setCreating(true)
    try {
      const bridge = getBridge()
      const store = displayed.knownFacts.find((f) => f.key === 'store')?.value ?? ''
      const created = await bridge.projects.create({
        name: displayed.product.displayName || text.trim().slice(0, 60) || 'Comercial',
        brief: {
          productOrService: displayed.product.displayName || text.trim(),
          businessName: store,
          category: CATEGORY_TO_BRIEF[displayed.product.category] as never,
        },
      })
      if (!created.ok) {
        toast.show('No pudimos crear el comercial.', 'error')
        return
      }
      // Persist the accepted plan on the new project (explicit, never overwriting
      // another commercial — this is a brand-new project id).
      await bridge.projects.save({ ...created.value, commercialPlan: displayed })
      toast.show(copy.assistant.created, 'success')
      onCreated(created.value.id, created.value.name)
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className={styles.assistant} aria-label={copy.assistant.title}>
      <h2 className={styles.heading}>{copy.assistant.title}</h2>
      <p className={styles.subtitle}>{copy.assistant.subtitle}</p>

      <div className={styles.requestRow}>
        <TextArea
          aria-label={copy.assistant.title}
          placeholder={copy.assistant.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={400}
        />
        <Button rightIcon="arrow-right" onClick={analyze} disabled={!text.trim()} data-testid="assistant-analyze">
          {plan ? copy.assistant.reanalyze : copy.assistant.analyze}
        </Button>
      </div>

      {displayed ? (
        <div className={styles.plan} data-testid="assistant-plan">
          {/* Producto detectado */}
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>{copy.assistant.detectedProduct}</h3>
            <p className={styles.product} data-testid="assistant-product">{displayed.product.displayName}</p>
          </div>

          {/* Información por confirmar + confirmados */}
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>{copy.assistant.toConfirm}</h3>
            <p className={styles.hint}>{copy.assistant.toConfirmHint}</p>
            <div className={styles.factGrid}>
              {factFields.map((f) => (
                <label key={f.key} className={styles.factField}>
                  <span>{f.label}</span>
                  <input
                    value={f.value}
                    onChange={(e) => onFactChange(f.key, e.target.value)}
                    data-testid={`fact-${f.key}`}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Enfoque */}
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>{copy.assistant.angle}</h3>
            <p className={styles.angle} data-testid="assistant-angle">{displayed.selectedAngle}</p>
          </div>

          {/* Narración + texto en pantalla (editable) */}
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>{copy.assistant.narration}</h3>
            <div className={styles.scenes}>
              {displayed.narrationScenes.map((s) => (
                <div key={s.sceneId} className={styles.scene} data-testid={`scene-${s.role}`}>
                  <div className={styles.sceneRole}>{copy.assistant.roleLabel[s.role]}</div>
                  <input
                    className={styles.sceneSpoken}
                    value={s.spokenText}
                    onChange={(e) => editScene(s.sceneId, { spoken: e.target.value })}
                    data-testid={`narration-${s.role}`}
                    aria-label={`${copy.assistant.narration} ${copy.assistant.roleLabel[s.role]}`}
                  />
                  <input
                    className={styles.sceneOverlay}
                    value={s.overlayText}
                    onChange={(e) => editScene(s.sceneId, { overlay: e.target.value })}
                    data-testid={`overlay-${s.role}`}
                    aria-label={`${copy.assistant.overlays} ${copy.assistant.roleLabel[s.role]}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Plan visual */}
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>{copy.assistant.visualPlan}</h3>
            <ol className={styles.storyboard}>
              {displayed.storyboardScenes.map((b) => (
                <li key={b.sceneId} data-testid={`storyboard-${b.role}`}>
                  <strong>{copy.assistant.roleLabel[b.role]}</strong> — {copy.assistant.mediaPlan[b.mediaPlan]}
                </li>
              ))}
            </ol>
          </div>

          {/* Clips externos */}
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>{copy.assistant.externalClips}</h3>
            {displayed.videoPrompts.length === 0 ? (
              <p className={styles.hint}>{copy.assistant.externalNone}</p>
            ) : (
              <div data-testid="external-clips">
                <p className={styles.hint}>{copy.assistant.externalNote}</p>
                {displayed.videoPrompts.map((p) => (
                  <div key={p.sceneId} className={styles.clip}>
                    <div className={styles.clipMeta}>~{p.durationSec}s · vertical · sin audio</div>
                    <div className={styles.clipPrompt}>{p.prompt}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Avisos */}
          {displayed.warnings.length > 0 ? (
            <div className={styles.warnings} data-testid="assistant-warnings">
              {displayed.warnings.map((w, i) => (
                <p key={i}>⚠ {w}</p>
              ))}
            </div>
          ) : null}

          {/* Actions */}
          <div className={styles.actions}>
            <Button variant="secondary" leftIcon="bulb" onClick={() => setPrivacyOpen(true)} data-testid="assistant-ai">
              {copy.assistant.aiPropose}
            </Button>
            <Button block leftIcon="check-circle" onClick={() => void create()} disabled={creating} data-testid="assistant-create">
              {copy.assistant.createCommercial}
            </Button>
          </div>
        </div>
      ) : null}

      {/* AI privacy preview — shows the EXACT text that would be sent, nothing else. */}
      <Modal open={privacyOpen} title={copy.assistant.aiPrivacyTitle} testId="ai-privacy-dialog">
        {displayed ? (
          <>
            <p className={styles.hint}>{copy.assistant.aiPrivacyNote}</p>
            <pre className={styles.privacy} data-testid="ai-privacy-content">
              {JSON.stringify(sanitizeCreativeRequest(displayed), null, 2)}
            </pre>
            {!aiAvailable ? <p className={styles.aiNote} data-testid="ai-not-configured">{copy.assistant.aiNotConfigured}</p> : null}
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => setPrivacyOpen(false)}>{copy.assistant.cancel}</Button>
              <Button
                variant="secondary"
                onClick={() => setPrivacyOpen(false)}
                data-testid="ai-use-without"
              >
                {copy.assistant.aiWithout}
              </Button>
              <Button disabled={!aiAvailable} data-testid="ai-continue">{copy.assistant.aiContinue}</Button>
            </div>
          </>
        ) : null}
      </Modal>

      {!displayed ? (
        <div className={styles.empty}>
          <Icon name="bulb" size={28} />
          <p>{copy.assistant.subtitle}</p>
        </div>
      ) : null}
    </section>
  )
}
