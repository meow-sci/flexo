import { useEffect } from 'react'
import { useStore } from '@nanostores/react'
import { Crosshair } from 'lucide-react'
import {
  DisclosureSection,
  ListBoxItem,
  Select,
  Switch,
  SectionTitle,
  ToggleButton,
  ToggleButtonGroup,
} from './kit'
import { Field } from './GameDataSections'
import {
  CustomPropellantsSection,
  GimbalsSection,
  PartGasGeneratorSection,
  PartSolidMotorSection,
  RocketControllersSection,
  SubPartEngineSection,
} from './EngineSections'
import { $part, addEngine, addSrbEngine } from '../state/editorStore'
import {
  $activeEngineData,
  $activeEngineEntry,
  $engineEntries,
  $engineExhaustGizmo,
  $resolvedNozzleTargets,
  setActiveEngine,
  setActiveEngineTemplate,
  setActiveNozzleRef,
  setEngineExhaustGizmo,
  type EngineEntry,
  type NozzleTarget,
} from '../state/engineStore'
import { $allReactionIndex, ensureReactionsLoaded } from '../state/reactionStore'
import { predictPerformance, type EnginePerformance } from '../ksa/enginePhysics'
import { resolveReactionLut } from '../ksa/reactionCatalog'
import type { Combustor, DeLavalNozzle, EditingPart, SubPartGameData } from '../ksa/types'

/** Short, human label for a SubPart template id (its last underscore segment). */
function shortLabel(templateId: string): string {
  const seg = templateId.split('_').pop() ?? templateId
  return seg.replace(/Assembly$/, '')
}

/** Select key for the part-scope entry — the `NONE` sentinel idiom, not a template id. */
const PART_ENTRY_KEY = '\0part'

const entryKey = (e: EngineEntry): string => (e.kind === 'part' ? PART_ENTRY_KEY : e.templateId)
const entryLabel = (e: EngineEntry): string =>
  e.kind === 'part' ? 'Part-level (RCS / gas generator)' : shortLabel(e.templateId)

/**
 * The Engine Designer body (full-sidebar `$inspectorMode === 'engine'`). Lists the part's
 * engines — every SubPart template carrying a thrust chamber, PLUS a part-scope entry when
 * `<PartGameData>` carries engine hardware itself (how stock authors an RCS battery and
 * gas-generator cycles) — lets you define a new one on a reused placement, and, for the
 * active engine, shows a LIVE sea-level/vacuum thrust + Isp readout (the in-game
 * EngineDesigner math, in-browser), the chamber/nozzle/FX editors, the 3D exhaust handles,
 * and the controller + gimbal wiring. Mirrors the Animation editor's list-on-top layout.
 */
export function EnginePanel() {
  const part = useStore($part)
  const entries = useStore($engineEntries)
  const activeEntry = useStore($activeEngineEntry)
  const activeSpd = useStore($activeEngineData)

  useEffect(() => {
    void ensureReactionsLoaded()
  }, [])

  // Placements whose template isn't an engine yet — candidates for "New engine".
  const engineTemplateSet = new Set(
    entries.flatMap((e) => (e.kind === 'subpart' ? [e.templateId] : [])),
  )
  const candidates = part.placements.filter((p) => !engineTemplateSet.has(p.subPartTemplateId))

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-1">
      <div className="flex flex-col gap-2">
        <Field label="Engine (thrust chamber, or the part itself)">
          <Select
            size="sm"
            aria-label="Active engine"
            placeholder={entries.length ? 'Select an engine' : 'No engines yet'}
            value={activeEntry ? entryKey(activeEntry) : null}
            onChange={(k) =>
              setActiveEngine(
                k === PART_ENTRY_KEY
                  ? { kind: 'part' }
                  : { kind: 'subpart', templateId: String(k) },
              )
            }
          >
            {entries.map((e) => (
              <ListBoxItem key={entryKey(e)} id={entryKey(e)} textValue={entryLabel(e)}>
                {entryLabel(e)}
              </ListBoxItem>
            ))}
          </Select>
        </Field>

        {candidates.length > 0 ? (
          <>
            <Field label="Define a new engine on a placed SubPart">
              <Select
                size="sm"
                aria-label="New engine on placement"
                placeholder="Pick a placement…"
                value={null}
                onChange={(k) => {
                  const placement = part.placements.find((p) => p.instanceId === String(k))
                  if (!placement) return
                  addEngine(placement.subPartTemplateId, placement.instanceId)
                  setActiveEngineTemplate(placement.subPartTemplateId)
                }}
              >
                {candidates.map((p) => (
                  <ListBoxItem key={p.instanceId} id={p.instanceId} textValue={p.instanceId}>
                    {p.instanceId} — {shortLabel(p.subPartTemplateId)}
                  </ListBoxItem>
                ))}
              </Select>
            </Field>
            <Field label="…or an SRB (approximate, fixed-thrust)">
              <Select
                size="sm"
                aria-label="New SRB on placement"
                placeholder="Pick a placement…"
                value={null}
                onChange={(k) => {
                  const placement = part.placements.find((p) => p.instanceId === String(k))
                  if (!placement) return
                  addSrbEngine(placement.subPartTemplateId, placement.instanceId)
                  setActiveEngineTemplate(placement.subPartTemplateId)
                }}
              >
                {candidates.map((p) => (
                  <ListBoxItem key={p.instanceId} id={p.instanceId} textValue={p.instanceId}>
                    {p.instanceId} — {shortLabel(p.subPartTemplateId)}
                  </ListBoxItem>
                ))}
              </Select>
            </Field>
            <p className="text-[11px] leading-snug text-fg-subtle">
              SRB = a non-throttleable engine burning Core's APCP solid reaction + a sealed
              propellant tank. KSA still has no solid-motor hardware, so it can't reproduce a real
              SRB: thrust is flat (no burn-time curve), it stays shutdown-able, and propellant
              drains like a liquid.
            </p>
          </>
        ) : part.placements.length === 0 ? (
          <p className="text-xs text-fg-subtle">
            Place a SubPart in the workspace first, then define an engine on it.
          </p>
        ) : null}
      </div>

      {activeEntry?.kind === 'part' ? (
        <PartEngineEditor part={part} />
      ) : activeSpd ? (
        <SubPartEngineEditor
          combustor={activeSpd.combustors[0] ?? null}
          nozzle={activeSpd.nozzles[0] ?? null}
          spd={activeSpd}
        />
      ) : (
        <p className="text-xs text-fg-subtle">
          Select an engine above, or define one on a placed SubPart. An engine is a combustor +
          nozzle that travel with a reused mesh, wired to a controller.
        </p>
      )}

      <DisclosureSection title="Custom propellants" badge={part.customReactions.length || ''}>
        <CustomPropellantsSection part={part} />
      </DisclosureSection>
    </div>
  )
}

/** The wiring block, shared by both scopes — controllers and gimbals are always part-level. */
function WiringSection({ part }: { part: EditingPart }) {
  return (
    <DisclosureSection title="Wiring (controllers + gimbals)" defaultExpanded>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <SectionTitle>Controllers</SectionTitle>
          <RocketControllersSection part={part} />
        </div>
        <div className="flex flex-col gap-2">
          <SectionTitle>Gimbals</SectionTitle>
          <GimbalsSection part={part} />
        </div>
      </div>
    </DisclosureSection>
  )
}

function SubPartEngineEditor({
  combustor,
  nozzle,
  spd,
}: {
  combustor: Combustor | null
  nozzle: DeLavalNozzle | null
  spd: SubPartGameData
}) {
  const part = useStore($part)
  return (
    <div className="flex flex-col gap-3">
      {combustor && nozzle && <PerformanceReadout combustor={combustor} nozzle={nozzle} />}

      <ExhaustPlacement />

      <DisclosureSection title="Thrust chamber" defaultExpanded>
        <SubPartEngineSection spd={spd} />
      </DisclosureSection>

      <WiringSection part={part} />

      {/* Genuinely advanced HERE: a part-level combustor/nozzle on a part whose engine lives
          on a SubPart is a gas-generator cycle. The part-scope entry above is its real home. */}
      <DisclosureSection title="Gas generator (advanced)">
        <PartGasGeneratorSection part={part} />
      </DisclosureSection>
    </div>
  )
}

/**
 * The part-scope engine editor: `<PartGameData>`'s own combustors/nozzles/rockets and solid
 * motor hardware as the PRIMARY editor rather than an "advanced" disclosure. This is the
 * stock RCS pattern — the MMU authors its whole battery of nozzles on the part — and before
 * this the designer couldn't see such a part as an engine at all.
 */
function PartEngineEditor({ part }: { part: EditingPart }) {
  const g = part.gameData
  return (
    <div className="flex flex-col gap-3">
      {g.combustors[0] && g.nozzles[0] && (
        <PerformanceReadout combustor={g.combustors[0]} nozzle={g.nozzles[0]} />
      )}

      <ExhaustPlacement />

      <DisclosureSection title="Combustors, nozzles + rockets" defaultExpanded>
        <PartGasGeneratorSection part={part} />
      </DisclosureSection>

      <DisclosureSection
        title="Solid motor hardware"
        defaultExpanded={
          g.solidMotors.length > 0 || g.solidNozzles.length > 0 || g.solidGrainSegments.length > 0
        }
      >
        <PartSolidMotorSection part={part} />
      </DisclosureSection>

      <WiringSection part={part} />
    </div>
  )
}

/**
 * Chip label for one nozzle handle: the nozzle id, `#N` when its template is placed more
 * than once (all those handles are the SAME nozzle in different frames, so the id alone
 * would repeat), and `· FX` for the plume-override channel.
 */
function targetLabel(t: NozzleTarget): string {
  const instance = t.instanceCount > 1 ? ` #${t.instanceIndex + 1}` : ''
  return `${t.nozzle.id}${instance}${t.ref.channel === 'fx' ? ' · FX' : ''}`
}

/**
 * The "Place exhaust in 3D" toggle plus one chip per nozzle handle of the open engine.
 *
 * Chips rather than a Select because SPATIAL identity is the point: the chip list mirrors the
 * viewport's handles one-for-one, and clicking either re-targets the gizmo. Hidden entirely
 * when the open engine has no nozzles — there is nothing to place. The list is height-capped
 * and scrolls: the MMU backpack authors 56 nozzles, most with an FX override.
 *
 * A SubPart-owned nozzle gets one chip PER PLACEMENT of its template (every stock RCS block
 * is one `<DeLavalNozzle>` placed 4×, and each placement is a real in-game thruster) — so the
 * panel says out loud that they are one nozzle and an edit moves all of them, the same
 * warning the light inspector gives for its per-placement markers.
 */
function ExhaustPlacement() {
  const gizmoOn = useStore($engineExhaustGizmo)
  const targets = useStore($resolvedNozzleTargets)
  if (targets.length === 0) return null
  const active = targets.find((t) => t.isActive)
  const shared = active && active.instanceCount > 1
  return (
    <div className="flex flex-col gap-2">
      <Switch isSelected={gizmoOn} onChange={setEngineExhaustGizmo}>
        <span className="inline-flex items-center gap-1">
          <Crosshair size={14} /> Place exhaust in 3D
        </span>
      </Switch>
      {targets.length > 1 && (
        <ToggleButtonGroup
          className="max-h-32 w-auto flex-wrap overflow-y-auto"
          aria-label="Nozzle to place"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={active ? [active.key] : []}
          onSelectionChange={(keys) => {
            const key = [...keys][0]
            const target = targets.find((t) => t.key === key)
            if (target) setActiveNozzleRef(target.ref)
          }}
        >
          {/* flex-none: ToggleButton is flex-1 for segmented controls, which would stretch
              a lone wrapped chip to full width. */}
          {targets.map((t) => (
            <ToggleButton
              key={t.key}
              id={t.key}
              size="sm"
              className="flex-none"
              aria-label={
                t.ref.scope === 'subpart' && t.ref.instanceId
                  ? `${targetLabel(t)} on ${t.ref.instanceId}`
                  : targetLabel(t)
              }
            >
              {targetLabel(t)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
      {shared && (
        <p className="text-[11px] leading-snug text-fg-subtle">
          <span className="font-mono">{active.nozzle.id}</span> is ONE nozzle instantiated on all{' '}
          {active.instanceCount} placements of this SubPart — each is a real thruster in-game.
          You're editing through{' '}
          <span className="font-mono">
            {active.ref.scope === 'subpart' ? active.ref.instanceId : ''}
          </span>
          ; the other handles move with it.
        </p>
      )}
      {gizmoOn && (
        <p className="text-[11px] leading-snug text-fg-subtle">
          Move drags the exhaust point; Rotate re-aims the direction (roll does nothing — the plume
          is axially symmetric in-game). Click any handle in the viewport to switch nozzle.
        </p>
      )}
    </div>
  )
}

/** A two-column metric row. */
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2" title={hint}>
      <span className="text-xs text-fg-subtle">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  )
}

/**
 * Live thrust/Isp readout for the active engine's primary combustor + nozzle, computed
 * in-browser by the ported KSA physics. Requires the reaction catalog (Reactions.xml)
 * — absent it shows a hint, since the engine still authors/exports fine without a preview.
 * A MixtureReaction additionally needs the combustor's O/F mixture ratio set (KSA itself
 * refuses to load a combustor without one).
 */
function PerformanceReadout({
  combustor,
  nozzle,
}: {
  combustor: Combustor
  nozzle: DeLavalNozzle
}) {
  const index = useStore($allReactionIndex)
  const reaction = index.get(combustor.reactionId)

  if (!reaction) {
    return (
      <div className="rounded-md border border-border bg-panel-sunken p-2 text-xs text-fg-subtle">
        Live performance needs the reaction catalog (Reactions.xml). Pick a known propellant, or
        it's unavailable in this build — the engine still exports correctly.
      </div>
    )
  }

  const lut = resolveReactionLut(reaction, combustor.mixtureRatio)
  if (!lut) {
    return (
      <div className="rounded-md border border-border bg-panel-sunken p-2 text-xs text-fg-subtle">
        {reaction.name} is a mixture reaction — set the combustor's O/F mixture ratio to preview
        performance (KSA requires it to load the engine).
      </div>
    )
  }

  const perf: EnginePerformance = predictPerformance({
    lut,
    maxPressurePa: combustor.maxPressurePa,
    exitDiameterM: nozzle.exitDiameterM,
    areaRatio: nozzle.areaRatio,
    thermalEfficiency: combustor.thermalEfficiency,
    flowEfficiency: nozzle.flowEfficiency,
    expansionEfficiency: nozzle.expansionEfficiency,
  })
  const kN = (n: number) => `${(n / 1000).toFixed(1)} kN`
  const s = (n: number) => `${n.toFixed(1)} s`

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-panel-sunken p-2">
      <SectionTitle>Performance — {reaction.name}</SectionTitle>
      <Metric label="Thrust (vacuum)" value={kN(perf.thrustVacN)} />
      <Metric label="Thrust (sea level)" value={kN(perf.thrustSLN)} />
      <Metric label="Isp (vacuum)" value={s(perf.ispVac)} />
      <Metric label="Isp (sea level)" value={s(perf.ispSL)} />
      <Metric label="Mass flow" value={`${perf.massFlowRate.toFixed(1)} kg/s`} />
      <Metric label="Throat diameter" value={`${(perf.throatDiameterM * 100).toFixed(1)} cm`} />
      {perf.flowSeparationSeveritySL > 0 && (
        <Metric
          label="⚠ Flow separation (SL)"
          value={`${(perf.flowSeparationSeveritySL * 100).toFixed(0)}%`}
          hint="The nozzle over-expands at sea level — fine for a vacuum engine, but it would shake apart low in the atmosphere."
        />
      )}
      <Metric
        label="Optimum expansion"
        value={`${(perf.optimumExpansionPa / 1000).toFixed(2)} kPa`}
        hint="Ambient pressure at which the exhaust is perfectly expanded."
      />
    </div>
  )
}
