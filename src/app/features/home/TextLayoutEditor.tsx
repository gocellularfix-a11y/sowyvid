import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../ui/Icon'
import { Button } from '../../ui/Button'
import { tileImageUrl } from '../../mediaUrl'
import { sceneTextInput } from '@render/remotionProps'
import {
  resolveSceneTextLayouts,
  upsertOverride,
  resetElement,
  resetScene,
  copyLayoutToScenes,
  snapLayout,
  clampToSafe,
  clamp01,
  isUnsafe,
  safeArea,
  MIN_WIDTH,
  MAX_WIDTH,
  MIN_SCALE,
  MAX_SCALE,
  type TextRole,
  type TextLayout,
  type ResolvedTextElement,
} from '@features/visual/textLayout'
import type { TextLayoutOverride, TextAlignment } from '@shared/domain/textLayout'
import type { VisualPlan } from '@features/visual/visualPlan'
import type { MediaAsset } from '@shared/domain/media'
import { copy } from '../../content/copy'
import styles from './TextLayoutEditor.module.css'

/**
 * Direct-manipulation text editor. The owner clicks a text block, drags it,
 * resizes it, and aligns it — no coordinates typed. It writes the SAME canonical
 * normalized layout the preview and export consume, so what is placed here is
 * what renders. It edits a paused, per-scene canvas (not the live player) so the
 * chosen scene stays put and playback never fights the drag.
 */

const ROLE_LABEL: Record<TextRole, string> = {
  headline: 'Título',
  subtitle: 'Subtítulo',
  offer: 'Oferta',
  cta: 'Llamado a la acción',
  'business-name': 'Nombre del negocio',
}
const ROLE_FONT_FACTOR: Record<TextRole, number> = {
  subtitle: 0.03,
  headline: 0.06,
  offer: 0.032,
  cta: 0.06,
  'business-name': 0.05,
}
const NUDGE = 0.005
const NUDGE_BIG = 0.02

interface DragState {
  role: TextRole
  mode: 'move' | 'resize'
  startX: number
  startY: number
  startLayout: TextLayout
  locked: boolean
}

export function TextLayoutEditor({
  visualPlan,
  projectId,
  media,
  textLayouts,
  onChange,
  onClose,
}: {
  visualPlan: VisualPlan
  projectId: string
  media: readonly MediaAsset[]
  textLayouts: readonly TextLayoutOverride[]
  /** Instant preview + (debounced) persistence live in the parent. */
  onChange: (next: TextLayoutOverride[]) => void
  onClose: () => void
}): JSX.Element {
  const aspectRatio = visualPlan.aspectRatio
  const scenes = visualPlan.scenes
  const [sceneIndex, setSceneIndex] = useState(0)
  const [selectedRole, setSelectedRole] = useState<TextRole | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dragLayout, setDragLayout] = useState<TextLayout | null>(null)
  const [snapGuides, setSnapGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] })
  const [copyOpen, setCopyOpen] = useState(false)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)

  const scene = scenes[Math.min(sceneIndex, scenes.length - 1)]!
  const sceneInput = useMemo(() => sceneTextInput(scene, visualPlan.width), [scene, visualPlan.width])
  const resolved = useMemo(
    () => resolveSceneTextLayouts(sceneInput, textLayouts, aspectRatio),
    [sceneInput, textLayouts, aspectRatio],
  )

  // Keep the selection valid as scenes change.
  useEffect(() => {
    if (selectedRole && !resolved.some((e) => e.role === selectedRole)) setSelectedRole(null)
  }, [resolved, selectedRole])

  const selected = resolved.find((e) => e.role === selectedRole) ?? null
  const s = safeArea(aspectRatio)

  /** Layout shown for an element right now (drag draft overrides persisted). */
  const layoutFor = (el: ResolvedTextElement): TextLayout =>
    drag && drag.role === el.role && dragLayout ? dragLayout : el.layout

  const commit = useCallback(
    (role: TextRole, layout: TextLayout, locked = false) => {
      onChange(upsertOverride(textLayouts, { sceneId: scene.id, role, aspectRatio }, layout, locked))
    },
    [onChange, textLayouts, scene.id, aspectRatio],
  )

  // ---------- pointer drag / resize ----------
  // Live drafts + the commit target are refs so the window-level listeners
  // (bound once per drag) always see the latest values without re-binding.
  const draftRef = useRef<TextLayout | null>(null)
  const commitRef = useRef<typeof commit>(commit)
  commitRef.current = commit

  const beginDrag = (e: React.PointerEvent, el: ResolvedTextElement, mode: 'move' | 'resize'): void => {
    if (el.locked && mode === 'move') return
    e.preventDefault()
    e.stopPropagation()
    setSelectedRole(el.role)
    draftRef.current = el.layout
    setDrag({ role: el.role, mode, startX: e.clientX, startY: e.clientY, startLayout: el.layout, locked: el.locked })
    setDragLayout(el.layout)
  }

  const cancelDrag = (): void => {
    draftRef.current = null
    setDrag(null)
    setDragLayout(null)
    setSnapGuides({ vertical: [], horizontal: [] })
  }

  // Window-level drag: robust even if the pointer leaves the canvas, and immune
  // to pointer-capture routing (the reason a canvas-only listener missed moves).
  useEffect(() => {
    if (!drag) return
    const siblingXs = resolved.filter((el) => el.role !== drag.role).map((el) => el.layout.x)
    const onMove = (e: PointerEvent): void => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const dx = (e.clientX - drag.startX) / rect.width
      const dy = (e.clientY - drag.startY) / rect.height
      const altHeld = e.altKey
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        let next: TextLayout
        if (drag.mode === 'move') {
          const moved: TextLayout = { ...drag.startLayout, x: clamp01(drag.startLayout.x + dx), y: clamp01(drag.startLayout.y + dy) }
          const snapped = snapLayout(moved, aspectRatio, siblingXs, !altHeld)
          setSnapGuides(snapped.guides)
          next = clampToSafe(snapped.layout, aspectRatio)
        } else {
          const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, drag.startLayout.width + dx * 2))
          next = clampToSafe({ ...drag.startLayout, width }, aspectRatio)
        }
        draftRef.current = next
        setDragLayout(next)
      })
    }
    const onUp = (): void => {
      const draft = draftRef.current
      // Only a real move/resize commits — a plain click just selects.
      if (draft) {
        const s0 = drag.startLayout
        if (draft.x !== s0.x || draft.y !== s0.y || draft.width !== s0.width) {
          commitRef.current(drag.role, draft, drag.locked)
        }
      }
      draftRef.current = null
      setDrag(null)
      setDragLayout(null)
      setSnapGuides({ vertical: [], horizontal: [] })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, resolved, aspectRatio])

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!selected) return
      if (e.key === 'Escape') {
        if (drag) cancelDrag()
        return
      }
      const step = e.shiftKey ? NUDGE_BIG : NUDGE
      let dx = 0
      let dy = 0
      if (e.key === 'ArrowLeft') dx = -step
      else if (e.key === 'ArrowRight') dx = step
      else if (e.key === 'ArrowUp') dy = -step
      else if (e.key === 'ArrowDown') dy = step
      else return
      if (selected.locked) return
      e.preventDefault()
      const moved = clampToSafe({ ...selected.layout, x: clamp01(selected.layout.x + dx), y: clamp01(selected.layout.y + dy) }, aspectRatio)
      commit(selected.role, moved)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, drag, aspectRatio, commit])

  // ---------- selection with overlap cycling ----------
  const onCanvasPointerDown = (e: React.PointerEvent): void => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      setSelectedRole(null)
      return
    }
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    // Which boxes are under the pointer (by their bounding box).
    const hits = resolved.filter((el) => {
      const l = layoutFor(el)
      const halfW = l.width / 2
      const halfH = 0.06 * l.scale
      return Math.abs(px - l.x) <= halfW && Math.abs(py - l.y) <= halfH
    })
    if (hits.length === 0) {
      setSelectedRole(null)
      return
    }
    // Cycle predictably when boxes overlap.
    const idx = hits.findIndex((el) => el.role === selectedRole)
    setSelectedRole(hits[(idx + 1) % hits.length]!.role)
  }

  // ---------- controls ----------
  const patchSelected = (patch: Partial<TextLayout>): void => {
    if (!selected) return
    commit(selected.role, { ...selected.layout, ...patch })
  }
  const setAlignment = (alignment: TextAlignment): void => patchSelected({ alignment })
  const toggleLock = (): void => {
    if (!selected) return
    commit(selected.role, selected.layout, !selected.locked)
  }
  const resetSelected = (): void => {
    if (!selected) return
    onChange(resetElement(textLayouts, { sceneId: scene.id, role: selected.role, aspectRatio }))
  }
  const resetThisScene = (): void => {
    onChange(resetScene(textLayouts, scene.id, aspectRatio))
  }

  const applyPreset = (preset: string): void => {
    if (!selected) return
    const w = selected.layout.width
    const presets: Record<string, Partial<TextLayout>> = {
      arriba: { x: 0.5, y: s.top + 0.06, alignment: 'center' },
      centro: { x: 0.5, y: 0.5, alignment: 'center' },
      abajo: { x: 0.5, y: 1 - s.bottom - 0.06, alignment: 'center' },
      'esq-sup': { x: s.left + w / 2, y: s.top + 0.06, alignment: 'left' },
      'esq-inf': { x: s.left + w / 2, y: 1 - s.bottom - 0.06, alignment: 'left' },
    }
    patchSelected(presets[preset] ?? {})
  }

  const copyTo = (mode: 'all' | 'same-type' | 'next'): void => {
    if (!selected) return
    const key = { sceneId: scene.id, role: selected.role, aspectRatio }
    let targetIds: string[] = []
    if (mode === 'all') targetIds = scenes.map((sc) => sc.id)
    else if (mode === 'next') targetIds = scenes[sceneIndex + 1] ? [scenes[sceneIndex + 1]!.id] : []
    else {
      // Scenes whose copy renders the same role.
      targetIds = scenes
        .filter((sc) => sceneTextInput(sc, visualPlan.width).texts[selected.role])
        .map((sc) => sc.id)
    }
    onChange(copyLayoutToScenes(textLayouts, key, selected.layout, targetIds))
    setCopyOpen(false)
  }

  // Background: the scene's primary image/poster, so the canvas looks like the scene.
  const bgAsset = scene.media
    .map((m) => media.find((a) => a.id === m.assetId))
    .find((a): a is MediaAsset => Boolean(a && a.valid))
  const bgUrl = bgAsset ? tileImageUrl(projectId, bgAsset) : null

  const selUnsafe = selected ? isUnsafe(layoutFor(selected), aspectRatio) : false

  return (
    <div className={styles.editor} data-testid="text-editor">
      <div className={styles.toolbar}>
        <strong className={styles.title}>{copy.textEditor.title}</strong>
        <div className={styles.sceneNav} data-testid="scene-nav">
          {scenes.map((sc, i) => (
            <button
              key={sc.id}
              className={[styles.sceneBtn, i === sceneIndex ? styles.sceneBtnOn : ''].join(' ')}
              onClick={() => {
                setSceneIndex(i)
                setSelectedRole(null)
              }}
              data-testid={`scene-tab-${i}`}
            >
              {copy.textEditor.scene} {i + 1}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={onClose} data-testid="text-editor-close">
          {copy.textEditor.done}
        </Button>
      </div>

      <div className={styles.stage}>
        <div
          ref={canvasRef}
          className={styles.canvas}
          style={{ aspectRatio: `${visualPlan.width} / ${visualPlan.height}` }}
          onPointerDown={onCanvasPointerDown}
          data-testid="text-canvas"
        >
          {bgUrl ? <img src={bgUrl} alt="" className={styles.canvasBg} /> : <div className={styles.canvasBg} />}
          <div className={styles.scrim} />

          {/* safe-area guides */}
          <div className={styles.safe} style={{ top: `${s.top * 100}%`, bottom: `${s.bottom * 100}%`, left: `${s.left * 100}%`, right: `${s.right * 100}%` }} data-testid="safe-area" />
          {/* snap guides */}
          {snapGuides.vertical.map((v) => (
            <div key={`v${v}`} className={styles.guideV} style={{ left: `${v * 100}%` }} />
          ))}
          {snapGuides.horizontal.map((h) => (
            <div key={`h${h}`} className={styles.guideH} style={{ top: `${h * 100}%` }} />
          ))}

          {resolved.map((el) => {
            const l = layoutFor(el)
            const isSel = el.role === selectedRole
            return (
              <div
                key={el.role}
                className={[styles.textBox, isSel ? styles.textBoxSelected : ''].join(' ')}
                style={{
                  left: `${l.x * 100}%`,
                  top: `${l.y * 100}%`,
                  width: `${l.width * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  textAlign: l.alignment,
                  fontSize: `calc(${ROLE_FONT_FACTOR[el.role] * l.scale} * (100cqw))`,
                }}
                onPointerDown={(e) => beginDrag(e, el, 'move')}
                data-testid={`text-box-${el.role}`}
                data-role={el.role}
              >
                <span className={styles.textInner}>{el.text}</span>
                {el.locked ? <span className={styles.lockBadge}>🔒</span> : null}
                {isSel ? (
                  <span
                    className={styles.resizeHandle}
                    onPointerDown={(e) => beginDrag(e, el, 'resize')}
                    data-testid={`resize-${el.role}`}
                    aria-label="Cambiar ancho"
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {/* ---------- controls for the selected element ---------- */}
      {selected ? (
        <div className={styles.controls} data-testid="text-controls">
          <div className={styles.selectedLabel} data-testid="selected-label">
            {copy.textEditor.selected} <strong>{ROLE_LABEL[selected.role]}</strong>
          </div>
          {selUnsafe ? (
            <div className={styles.warn} data-testid="unsafe-warning">{copy.textEditor.unsafe}</div>
          ) : null}

          <label className={styles.ctl}>
            <span>{copy.textEditor.size}</span>
            <input type="range" min={MIN_SCALE} max={MAX_SCALE} step={0.05} value={layoutFor(selected).scale}
              onChange={(e) => patchSelected({ scale: Number(e.target.value) })} data-testid="ctl-size" />
          </label>
          <label className={styles.ctl}>
            <span>{copy.textEditor.width}</span>
            <input type="range" min={MIN_WIDTH} max={MAX_WIDTH} step={0.02} value={layoutFor(selected).width}
              onChange={(e) => patchSelected({ width: Number(e.target.value) })} data-testid="ctl-width" />
          </label>

          <div className={styles.alignRow} role="group" aria-label={copy.textEditor.alignment}>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={[styles.alignBtn, selected.layout.alignment === a ? styles.alignOn : ''].join(' ')}
                onClick={() => setAlignment(a)} data-testid={`align-${a}`} aria-label={a}>
                {a === 'left' ? '⤛' : a === 'center' ? '≡' : '⤜'}
              </button>
            ))}
          </div>

          <div className={styles.presetRow}>
            {[['arriba', copy.textEditor.presets.top], ['centro', copy.textEditor.presets.center], ['abajo', copy.textEditor.presets.bottom], ['esq-sup', copy.textEditor.presets.topCorner], ['esq-inf', copy.textEditor.presets.bottomCorner]].map(([k, label]) => (
              <button key={k} className={styles.preset} onClick={() => applyPreset(k!)} data-testid={`preset-${k}`}>{label}</button>
            ))}
          </div>

          <div className={styles.actionRow}>
            <button className={styles.action} onClick={toggleLock} data-testid="ctl-lock">
              <Icon name="check-circle" size={14} /> {selected.locked ? copy.textEditor.unlock : copy.textEditor.lock}
            </button>
            <button className={styles.action} onClick={resetSelected} data-testid="ctl-reset" disabled={!selected.custom}>
              <Icon name="refresh" size={14} /> {copy.textEditor.resetElement}
            </button>
            <div className={styles.copyWrap}>
              <button className={styles.action} onClick={() => setCopyOpen((o) => !o)} data-testid="ctl-copy">
                {copy.textEditor.copyTo}
              </button>
              {copyOpen ? (
                <div className={styles.copyMenu} data-testid="copy-menu">
                  <button onClick={() => copyTo('all')} data-testid="copy-all">{copy.textEditor.copyAll}</button>
                  <button onClick={() => copyTo('same-type')} data-testid="copy-same">{copy.textEditor.copySame}</button>
                  <button onClick={() => copyTo('next')} data-testid="copy-next">{copy.textEditor.copyNext}</button>
                  <button onClick={() => setCopyOpen(false)}>{copy.textEditor.cancel}</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <p className={styles.hint} data-testid="text-hint">{copy.textEditor.hint}</p>
      )}

      <button className={styles.sceneReset} onClick={resetThisScene} data-testid="reset-scene">
        {copy.textEditor.resetScene}
      </button>
    </div>
  )
}
