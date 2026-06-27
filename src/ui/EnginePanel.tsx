import { useEffect } from 'react'
import { useStore } from '@nanostores/react'
import { Crosshair } from 'lucide-react'
import { DisclosureSection, ListBoxItem, Select, Switch, SectionTitle } from './kit'
import { Field } from './GameDataSections'
import {
  CustomPropellantsSection,
  GimbalsSection,
  PartGasGeneratorSection,
  RocketControllersSection,
  SubPartEngineSection,
} from './EngineSections'
import { $part, addEngine, addSrbEngine } from '../state/editorStore'
import {
  $activeEngineData,
  $activeEngineTemplateId,
  $engineExhaustGizmo,
  $engineTemplateIds,
  setActiveEngineTemplate,
  setEngineExhaustGizmo,
} from '../state/engineStore'
import { $allCombustionIndex, ensureCombustionLoaded } from '../state/combustionStore'
import { predictPerformance, type EnginePerformance } from '../ksa/enginePhysics'
import type { Combustor, DeLavalNozzle, SubPartGameData } from '../ksa/types'

/** Short, human label for a SubPart template id (its last underscore segment). */
function shortLabel(templateId: string): string {
  const seg = templateId.split('_').pop() ?? templateId
  return seg.replace(/Assembly$/, '')
}

/**
 * The Engine Designer body (full-sidebar `$inspectorMode === 'engine'`). Lists the
 * part's engines (thrust-chamber SubPart templates that carry a combustor), lets you
 * define a new one on a reused placement, and — for the active engine — shows a LIVE
 * sea-level/vacuum thrust + Isp readout (the in-game EngineDesigner math, in-browser),
 * the chamber/nozzle/FX editors, the 3D exhaust handle toggle, and the controller +
 * gimbal wiring. Mirrors the Animation editor's list-on-top + active-editor layout.
 */
export function EnginePanel() {
  const part = useStore($part)
  const templateIds = useStore($engineTemplateIds)
  const activeId = useStore($activeEngineTemplateId)
  const activeSpd = useStore($activeEngineData)

  useEffect(() => {
    void ensureCombustionLoaded()
  }, [])

  // Placements whose template isn't an engine yet — candidates for "New engine".
  const engineTemplateSet = new Set(templateIds)
  const candidates = part.placements.filter((p) => !engineTemplateSet.has(p.subPartTemplateId))

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-1">
      <div className="flex flex-col gap-2">
        <Field label="Engine (reusable thrust chamber)">
          <Select
            size="sm"
            aria-label="Active engine"
            placeholder={templateIds.length ? 'Select an engine' : 'No engines yet'}
            value={activeId}
            onChange={(k) => setActiveEngineTemplate(String(k))}
          >
            {templateIds.map((id) => (
              <ListBoxItem key={id} id={id} textValue={shortLabel(id)}>
                {shortLabel(id)}
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
              SRB = a non-throttleable engine + a sealed propellant tank. KSA has no solid-motor
              code, so it can't reproduce a real SRB: thrust is flat (no burn-time curve), it stays
              shutdown-able, and propellant drains like a liquid.
            </p>
          </>
        ) : part.placements.length === 0 ? (
          <p className="text-xs text-fg-subtle">
            Place a SubPart in the workspace first, then define an engine on it.
          </p>
        ) : null}
      </div>

      {activeSpd ? (
        <ActiveEngineEditor
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

      <DisclosureSection
        title="Custom propellants"
        badge={part.customCombustionProcesses.length || ''}
      >
        <CustomPropellantsSection part={part} />
      </DisclosureSection>
    </div>
  )
}

function ActiveEngineEditor({
  combustor,
  nozzle,
  spd,
}: {
  combustor: Combustor | null
  nozzle: DeLavalNozzle | null
  spd: SubPartGameData
}) {
  const gizmoOn = useStore($engineExhaustGizmo)
  const part = useStore($part)
  return (
    <div className="flex flex-col gap-3">
      {combustor && nozzle && <PerformanceReadout combustor={combustor} nozzle={nozzle} />}

      {nozzle && (
        <Switch isSelected={gizmoOn} onChange={setEngineExhaustGizmo}>
          <span className="inline-flex items-center gap-1">
            <Crosshair size={14} /> Place exhaust in 3D
          </span>
        </Switch>
      )}

      <DisclosureSection title="Thrust chamber" defaultExpanded>
        <SubPartEngineSection spd={spd} />
      </DisclosureSection>

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

      <DisclosureSection title="Gas generator (advanced)">
        <PartGasGeneratorSection part={part} />
      </DisclosureSection>
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
 * in-browser by the ported KSA physics. Requires the combustion catalog (Combustion.xml)
 * — absent it shows a hint, since the engine still authors/exports fine without a preview.
 */
function PerformanceReadout({
  combustor,
  nozzle,
}: {
  combustor: Combustor
  nozzle: DeLavalNozzle
}) {
  const index = useStore($allCombustionIndex)
  const process = index.get(combustor.combustionId)

  if (!process) {
    return (
      <div className="rounded-md border border-border bg-panel-sunken p-2 text-xs text-fg-subtle">
        Live performance needs the combustion catalog (Combustion.xml). Pick a known propellant, or
        it's unavailable in this build — the engine still exports correctly.
      </div>
    )
  }

  const perf: EnginePerformance = predictPerformance({
    lut: process.lut,
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
      <SectionTitle>Performance — {process.name}</SectionTitle>
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
