import { useStore } from '@nanostores/react';
import { ColorField, Field, ListBoxItem, SectionTitle, Select, Switch } from '../kit';
import { Section } from './TransformGroups';
import { PART_OWNER_KEY } from './ColliderInspector';
import { NumberField } from '../NumberField';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { LightFalloffCurve } from '../LightFalloffCurve';
import { hexToRgb01, rgb01ToHex } from '../colorHex';
import { DEG2RAD, RAD2DEG } from '../format';
import {
  $lightEditContext,
  $part,
  pushUndo,
  setLightOwner,
  setLightPosition,
  setLightRayTracing,
  setLightRotation,
  setLightType,
  updateLight,
  updateLightTransform,
} from '../../state/editorStore';
import { $lightSettings, DEFAULT_LIGHT_SETTINGS } from '../../state/settingsStore';
import {
  lightAimRotation,
  lightLocalFromWorld,
  lightWorld,
  lightWorldAim,
} from '../../three/coords';
import type { LightType, PartLight } from '../../ksa/types';

type Axis = 'x' | 'y' | 'z';

/**
 * The light focus card (design: design-build-mode.md §3.6) — v1's `LightHeader` verbatim.
 * It **replaces** the generic transform groups entirely: a light's position and aim live in
 * TWO frames and its scale is meaningless (KSA parses `<Scale>` and ignores it).
 *
 * A light's stored transform is in its OWNER frame (the Part assembly frame when
 * part-level), but the user works in the viewport — so position and aim are editable in BOTH
 * frames, converted through `coords.lightWorld`/`lightLocalFromWorld` using the **context
 * instance**: the placement whose marker was last clicked (`$lightEditContext` — the SAME
 * atom the gizmo's write-back frame comes from, which is what keeps these fields and the
 * gizmo in exact agreement). For a part-level light the two frames coincide and only one
 * position group is shown.
 *
 * The part-frame **aim vector** re-aims the Spot without wild rolling: the commit goes
 * through {@link lightAimRotation} (ΔQ = minimal rotation current→new aim, composed on top of
 * the current rotation); a degenerate (≈zero) vector is rejected by keeping the prior
 * rotation. Aim fields are Spot-only — KSA ignores a Point light's rotation.
 *
 * **Owner** re-homes the light between `<PartGameData>` and a template's
 * `<SubPartGameData>`, converting the pose through the old and new owners' FIRST placements
 * so the world pose doesn't jump (`setLightOwner` keeps the store three.js-free, so the
 * conversion lives here — the collider card's precedent).
 *
 * **Undo enrollment**: every numeric field is streaming (one push on focus); the colour
 * picker pushes once when its popover opens; the selects/switch write through discrete
 * mutators.
 */
export function LightInspector({
  index,
  light,
  locked,
}: {
  index: number;
  light: PartLight;
  locked: boolean;
}) {
  const part = useStore($part);
  const editContext = useStore($lightEditContext);
  // Defaulted the way `settingsStore.lightSettings()` does — `persistentJSON` replays a
  // stored object verbatim, so a settings blob written before a field existed would read it
  // as `undefined` and the curve would silently pick a different exposure than the
  // viewport's shells.
  const storedViz = useStore($lightSettings);
  const viz = { ...DEFAULT_LIGHT_SETTINGS, ...storedViz };

  const isSpot = light.type === 'Spot';
  const owners = light.ownerTemplateId
    ? part.placements.filter((p) => p.subPartTemplateId === light.ownerTemplateId)
    : [];
  // The scene's context rule verbatim (last clicked, default 0, clamped) — one atom, one
  // rule, so the part-frame fields below and the gizmo can never disagree.
  const contextIndex = Math.max(0, Math.min(editContext[light.id] ?? 0, owners.length - 1));
  const contextOwner = owners[contextIndex] ?? null;
  const world = lightWorld(light, contextOwner);
  const worldAim = lightWorldAim(world.rotation);
  // Every DISTINCT template actually placed in the part is a candidate owner.
  const templates = [...new Set(part.placements.map((p) => p.subPartTemplateId))].sort();

  /**
   * Re-homes the light, CONVERTING its transform through the old and new owners' first
   * placements so the world pose the user sees doesn't jump (instance 0 of each). No
   * `converted` for an unplaced NEW owner — the local numbers stay verbatim.
   */
  const changeOwner = (next: string | null) => {
    const from = light.ownerTemplateId
      ? part.placements.find((p) => p.subPartTemplateId === light.ownerTemplateId)
      : null;
    // The pose currently RENDERED: an unplaced/old-owner-less light draws in the Part frame,
    // which lightWorld(light, null) returns verbatim.
    const worldPose = lightWorld(light, from ?? null);
    const to = next ? part.placements.find((p) => p.subPartTemplateId === next) : null;
    setLightOwner(
      index,
      next,
      to ? lightLocalFromWorld(worldPose, to) : next === null ? worldPose : undefined,
    );
  };

  const localPosField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={light.position[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('move', light.id)}
      onCommit={(n) => setLightPosition(index, { ...light.position, [axis]: n })}
    />
  );
  const aimRotField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={light.rotation[axis] * RAD2DEG}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('rotate', light.id)}
      onCommit={(deg) => setLightRotation(index, { ...light.rotation, [axis]: deg * DEG2RAD })}
    />
  );
  const partPosField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={world.position[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('move', light.id)}
      onCommit={(n) =>
        updateLightTransform(
          index,
          lightLocalFromWorld(
            { ...world, position: { ...world.position, [axis]: n } },
            contextOwner,
          ),
        )
      }
    />
  );
  const aimField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={worldAim[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('rotate', light.id)}
      onCommit={(n) => {
        // Normalized on entry; a degenerate (≈zero) aim returns null — keep the prior
        // rotation rather than writing a NaN pose.
        const rotation = lightAimRotation(world.rotation, { ...worldAim, [axis]: n });
        if (!rotation) return;
        updateLightTransform(index, lightLocalFromWorld({ ...world, rotation }, contextOwner));
      }}
    />
  );

  return (
    <>
      <span className="truncate text-xs text-fg-subtle">
        {light.ownerTemplateId
          ? `via ${light.ownerTemplateId} · ${owners.length} instance${owners.length === 1 ? '' : 's'}`
          : 'part-level'}
      </span>
      {owners.length > 1 && (
        <span className="text-xs leading-snug text-fg-subtle">
          Editing through <span className="font-mono">{contextOwner?.instanceId}</span> — one light
          per template; edits affect every instance.
        </span>
      )}
      {light.ownerTemplateId != null && owners.length === 0 && (
        <span className="text-xs leading-snug text-fg-subtle">
          Owner template is not placed — this light is dead data.
        </span>
      )}

      <div className="grid grid-cols-2 gap-1">
        <Select
          size="sm"
          aria-label="Light owner"
          value={light.ownerTemplateId ?? PART_OWNER_KEY}
          isDisabled={locked}
          onChange={(key) => changeOwner(key === PART_OWNER_KEY ? null : String(key))}
        >
          <ListBoxItem id={PART_OWNER_KEY}>Part level</ListBoxItem>
          <>
            {templates.map((t) => (
              <ListBoxItem key={t} id={t}>
                {t.split('_').pop() || t}
              </ListBoxItem>
            ))}
          </>
        </Select>
        <Select
          size="sm"
          aria-label="Light type"
          value={light.type}
          isDisabled={locked}
          onChange={(key) => setLightType(index, key as LightType)}
        >
          <ListBoxItem id="Spot">Spot</ListBoxItem>
          <ListBoxItem id="Point">Point</ListBoxItem>
        </Select>
      </div>

      {/* Owner-frame position — only when a placed owner gives it a distinct frame;
          part-level (and unplaced-owner) lights get the single group below instead. */}
      {contextOwner !== null && (
        <Section title="Position (m, owner frame)">
          {localPosField('x')}
          {localPosField('y')}
          {localPosField('z')}
        </Section>
      )}
      {isSpot && (
        <Section title={contextOwner ? 'Aim rotation (°, owner frame)' : 'Aim rotation (°)'}>
          {aimRotField('x')}
          {aimRotField('y')}
          {aimRotField('z')}
        </Section>
      )}
      {/* Part-frame position (== the stored numbers when no placed owner: for a part-level
          light the owner frame IS the part frame; an unplaced owner's light renders in the
          Part frame but its numbers stay owner-frame, hence the label). */}
      <Section
        title={
          light.ownerTemplateId && !contextOwner
            ? 'Position (m, owner frame)'
            : 'Position (m, part frame)'
        }
      >
        {partPosField('x')}
        {partPosField('y')}
        {partPosField('z')}
      </Section>
      {isSpot && (
        <Section title="Aim (part frame, unit vector)">
          {aimField('x')}
          {aimField('y')}
          {aimField('z')}
        </Section>
      )}

      <Field label="Range (m)">
        <PreciseNumberInput
          aria-label="Light range in meters"
          value={light.rangeM}
          min={0}
          isDisabled={locked}
          onInteractionStart={() => pushUndo('edit light', light.id)}
          onCommit={(n) => updateLight(index, { rangeM: n })}
        />
      </Field>
      <Field label="Intensity">
        <PreciseNumberInput
          aria-label="Light intensity"
          value={light.intensity}
          min={0}
          isDisabled={locked}
          onInteractionStart={() => pushUndo('edit light', light.id)}
          onCommit={(n) => updateLight(index, { intensity: n })}
        />
      </Field>
      <div className="flex items-center gap-2">
        <span className="text-xs text-fg-subtle">Color</span>
        {/* The kit picker (design §3.6-8) replaces v1's native `<input type=color>`; its undo
            contract is the same — one step when the popover opens. */}
        <ColorField
          aria-label="Light color"
          value={rgb01ToHex(light.color)}
          onInteractionStart={() => pushUndo('edit light', light.id)}
          onChange={(hex) => updateLight(index, { color: hexToRgb01(hex) })}
        />
      </div>
      {isSpot && (
        <>
          <Field label="Inner Angle (°, half-cone)">
            <PreciseNumberInput
              aria-label="Spot inner cone half-angle in degrees"
              value={light.innerAngleRad * RAD2DEG}
              min={0}
              max={90}
              isDisabled={locked}
              onInteractionStart={() => pushUndo('edit light', light.id)}
              onCommit={(deg) => updateLight(index, { innerAngleRad: deg * DEG2RAD })}
            />
          </Field>
          <Field label="Outer Angle (°, half-cone)">
            <PreciseNumberInput
              aria-label="Spot outer cone half-angle in degrees"
              value={light.outerAngleRad * RAD2DEG}
              min={0}
              max={90}
              isDisabled={locked}
              onInteractionStart={() => pushUndo('edit light', light.id)}
              onCommit={(deg) => updateLight(index, { outerAngleRad: deg * DEG2RAD })}
            />
          </Field>
        </>
      )}
      {/* What Range + Intensity actually mean, on the same exposure the viewport's coverage
          shells use — so the panel and the 3D volume agree by construction. */}
      <div className="flex flex-col gap-1">
        <SectionTitle>Falloff along the aim axis</SectionTitle>
        <LightFalloffCurve
          rangeM={light.rangeM}
          intensity={light.intensity}
          exposureMode={viz.exposureMode}
          vizExposure={viz.vizExposure}
        />
      </div>
      <Switch
        isSelected={light.rayTracing}
        isDisabled={locked}
        onChange={(on) => setLightRayTracing(index, on)}
      >
        Ray tracing (IVA only)
      </Switch>
      <p className="text-xs leading-snug text-fg-subtle">
        Coverage &amp; preview → View menu · marker size → Settings → Viewport.
      </p>
    </>
  );
}
