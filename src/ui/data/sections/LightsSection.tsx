import {
  Button,
  ColorField,
  Field,
  ItemCard,
  ListBoxItem,
  Select,
  Switch,
  useIsPhone,
} from '../../kit';
import { PreciseNumberInput } from '../../PreciseNumberInput';
import { Vec3Field } from '../../Vec3Field';
import { DEG2RAD, RAD2DEG } from '../../format';
import { hexToRgb01, rgb01ToHex } from '../../colorHex';
import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import {
  addLight,
  pushUndo,
  removeLight,
  revealEntity,
  select,
  setLightPosition,
  setLightRayTracing,
  setLightRotation,
  setLightType,
  updateLight,
} from '../../../state/editorStore';
import { status } from '../../../state/statusStore';
import { closePhoneSheets } from '../../shell/phone/phoneSheets';
import type { EditingPart, LightType } from '../../../ksa/types';

/**
 * **Lights** (template scope) — full coverage of KSA's `<Light>` schema for the lights this
 * SubPart template owns (design: §A4.2 Lights; census `viewport-scene-view.md` §1.8).
 *
 * Two invariants carried over verbatim:
 *
 * - the rows are an owner-FILTERED view of `part.lights`, but every mutator index is an index
 *   into `part.lights` itself — the filtered position is display only;
 * - a SubPart-owned light is drawn once per PLACEMENT of its template and edits affect every
 *   instance, which is what the scope chip in the form header says structurally.
 *
 * **"Select in 3D" is the section that vindicates the whole mode.** In v1 it selected and
 * revealed the light underneath a fullscreen modal that covered the viewport (census pain 4);
 * here the form sits beside the visible 3D view, so the button does what it always claimed.
 *
 * Part-level lights are deliberately absent: they are Build entities with their own inspector,
 * and the navigator's not-data-capable rows explain that and jump there.
 *
 * **Undo enrollment** (§A10): `+ Light`, `Remove`, the type Select and the ray-tracing Switch
 * are discrete; position/rotation/range/intensity/color/cone stream one push at interaction
 * start (the color picker pushes once when its popover opens).
 */
export function LightsSection({
  part,
  templateId,
  meta,
}: {
  part: EditingPart;
  templateId: string;
  meta: SectionMeta;
}) {
  const isPhone = useIsPhone();
  const owned = part.lights
    .map((light, index) => ({ light, index }))
    .filter((entry) => entry.light.ownerTemplateId === templateId);

  return (
    <DataSection
      sectionId="lights"
      count={meta.count}
      issue={meta.issue}
      onAdd={() => addLight(templateId)}
    >
      {owned.length > 0 && (
        <span className="text-xs text-fg-subtle">
          Applies to every placed instance of this SubPart; each instance aims the light by its own
          rotation. Toggled in-game by the part&rsquo;s light switch.
        </span>
      )}
      {owned.map(({ light, index }, position) => {
        const isSpot = light.type === 'Spot';
        const push = () => pushUndo('edit light', '');
        return (
          <ItemCard
            key={light.id}
            title={`Light ${position + 1}`}
            onRemove={() => removeLight(index)}
          >
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onPress={() => {
                select([{ kind: 'light', id: light.id }]);
                revealEntity('light', light.id);
                // Phone: the sheet covers the viewport, so the reveal is invisible until it
                // closes — and the status channel says what happened (§A8).
                if (isPhone) {
                  closePhoneSheets();
                  status(`${light.id} selected`);
                }
              }}
            >
              Select in 3D
            </Button>
            <Field label="Type">
              <Select
                size="sm"
                aria-label="Light type"
                value={light.type}
                onChange={(k) => setLightType(index, k as LightType)}
              >
                <ListBoxItem id="Spot">Spot</ListBoxItem>
                <ListBoxItem id="Point">Point</ListBoxItem>
              </Select>
            </Field>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-fg-subtle">Position (m)</span>
              <Vec3Field
                value={light.position}
                onInteractionStart={push}
                onCommit={(axis, value) =>
                  setLightPosition(index, { ...light.position, [axis]: value })
                }
              />
            </div>
            {isSpot && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-fg-subtle">Aim rotation (°)</span>
                <Vec3Field
                  value={{
                    x: light.rotation.x * RAD2DEG,
                    y: light.rotation.y * RAD2DEG,
                    z: light.rotation.z * RAD2DEG,
                  }}
                  onInteractionStart={push}
                  onCommit={(axis, deg) =>
                    setLightRotation(index, { ...light.rotation, [axis]: deg * DEG2RAD })
                  }
                />
              </div>
            )}
            <Field label="Range (m)">
              <PreciseNumberInput
                aria-label="Light range in meters"
                value={light.rangeM}
                min={0}
                onInteractionStart={push}
                onCommit={(n) => updateLight(index, { rangeM: n })}
              />
            </Field>
            <Field label="Intensity">
              <PreciseNumberInput
                aria-label="Light intensity"
                value={light.intensity}
                min={0}
                onInteractionStart={push}
                onCommit={(n) => updateLight(index, { intensity: n })}
              />
            </Field>
            <ColorField
              label="Color"
              aria-label="Light color"
              value={rgb01ToHex(light.color)}
              onInteractionStart={push}
              onChange={(hex) => updateLight(index, { color: hexToRgb01(hex) })}
            />
            {isSpot && (
              <>
                <Field label="Inner half-angle (°)">
                  <PreciseNumberInput
                    aria-label="Spot inner cone half-angle in degrees"
                    value={light.innerAngleRad * RAD2DEG}
                    min={0}
                    max={90}
                    onInteractionStart={push}
                    onCommit={(deg) => updateLight(index, { innerAngleRad: deg * DEG2RAD })}
                  />
                </Field>
                <Field label="Outer half-angle (°)">
                  <PreciseNumberInput
                    aria-label="Spot outer cone half-angle in degrees"
                    value={light.outerAngleRad * RAD2DEG}
                    min={0}
                    max={90}
                    onInteractionStart={push}
                    onCommit={(deg) => updateLight(index, { outerAngleRad: deg * DEG2RAD })}
                  />
                </Field>
              </>
            )}
            <Switch isSelected={light.rayTracing} onChange={(on) => setLightRayTracing(index, on)}>
              Ray tracing (IVA only)
            </Switch>
          </ItemCard>
        );
      })}
      <Button size="sm" className="self-start" onPress={() => addLight(templateId)}>
        + Light
      </Button>
    </DataSection>
  );
}
