import {
  Button,
  DisclosureSection,
  Field,
  ItemCard,
  ListBoxItem,
  Select,
  TextField,
  cn,
} from '../../kit';
import { PreciseNumberInput } from '../../PreciseNumberInput';
import { Vec3Field } from '../../Vec3Field';
import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import { useFlashedCard } from '../flashedCard';
import {
  addTank,
  pushUndo,
  removeTank,
  setTankShape,
  updateTank,
  type TankOwner,
} from '../../../state/editorStore';
import type { Tank, TankRoleAffinity, TankShape } from '../../../ksa/types';

/**
 * **Tanks (feed containers)** — the one card set rendered at BOTH scopes (design: §A4.1
 * Tanks / §A4.2; census §1.1 Tanks).
 *
 * The section title is binding vocabulary (foundation §0.1): a KSA `<Tank>` is a **feed
 * container**, addressable by `<FeedsFrom Container>`. The wireframe *reference containers*
 * are an unrelated editor aid living under Build's Aids — the shared word "container" is the
 * naming trap this title exists to kill.
 *
 * Adds the per-tank **Advanced** disclosure (decision D3): `roleAffinity` and `locationAsmb`
 * were modeled and round-tripped with no widget at all.
 *
 * **Undo enrollment** (§A10): `+ Tank` / `Remove` / the shape Select are discrete editorStore
 * actions; every text/number field streams one push at interaction start.
 */
export function TanksSection({
  owner,
  tanks,
  meta,
}: {
  /** `null` = the `<PartGameData>` itself; a template id = that `<SubPartGameData>`. */
  owner: TankOwner;
  tanks: readonly Tank[];
  meta: SectionMeta;
}) {
  return (
    <DataSection
      sectionId="tanks"
      count={meta.count}
      issue={meta.issue}
      onAdd={() => addTank(owner)}
    >
      <span className="text-xs text-fg-subtle">
        {owner === null
          ? 'Part-level tanks are the only feed targets addressable without a SubPart= scope.'
          : 'Feeds address these per placement — TankB #1 · fuel_main and TankB #2 · fuel_main are two different feed targets.'}
      </span>
      {tanks.map((tank, i) => (
        // Keyed by feed id where it is authored, index only as the fallback: a middle removal
        // with index keys bleeds the focused input's draft into the next card (census pain 8).
        <TankCard key={tank.id.trim() || `#${i}`} owner={owner} tank={tank} index={i} />
      ))}
      <Button size="sm" className="self-start" onPress={() => addTank(owner)}>
        + Tank
      </Button>
    </DataSection>
  );
}

const ROLE_AFFINITIES: readonly { id: TankRoleAffinity; label: string }[] = [
  // KSA's `ConsumerRole` [Flags] enum. `Engine` IS the schema default (the element is omitted
  // at it), so it carries the "(default)" sentinel wording rather than a separate null option.
  { id: 'Engine', label: 'Engine (default)' },
  { id: 'Thruster', label: 'Thruster' },
  { id: 'Engine Thruster', label: 'Engine + Thruster' },
  { id: 'None', label: 'None' },
];

function TankCard({ owner, tank, index }: { owner: TankOwner; tank: Tank; index: number }) {
  // The findings pipeline names a tank card by its INDEX (`gameDataFindings.ts`), so a
  // duplicate-feed-id warning clicks through to exactly this card.
  const flashed = useFlashedCard() === String(index);
  const push = () => pushUndo('edit tank', '');
  const patch = (values: Partial<Tank>) => updateTank(owner, index, values);

  return (
    <div className={cn(flashed && 'row-flash rounded-md')}>
      <ItemCard title={`Tank ${index + 1}`} onRemove={() => removeTank(owner, index)}>
        <Field label="Feed id (reference it from an engine's Feeds from → Container)">
          <TextField
            size="sm"
            aria-label="Tank feed id"
            inputClassName="font-mono"
            placeholder="e.g. Fuel"
            value={tank.id}
            onFocus={push}
            onChange={(v) => patch({ id: v })}
          />
        </Field>
        <Field label="Shape">
          <Select
            size="sm"
            aria-label="Tank shape"
            value={tank.shape}
            onChange={(k) => setTankShape(owner, index, k as TankShape)}
          >
            <ListBoxItem id="Cylindrical">Cylindrical</ListBoxItem>
            <ListBoxItem id="Spherical">Spherical</ListBoxItem>
          </Select>
        </Field>
        <Field label="Wall Material Id">
          <TextField
            size="sm"
            aria-label="Wall material id"
            inputClassName="font-mono"
            value={tank.wallMaterialId}
            onFocus={push}
            onChange={(v) => patch({ wallMaterialId: v })}
          />
        </Field>
        {tank.shape === 'Cylindrical' && (
          <Field label="Length (m)">
            <PreciseNumberInput
              aria-label="Tank length in meters"
              value={tank.lengthM}
              min={0}
              onInteractionStart={push}
              onCommit={(n) => patch({ lengthM: n })}
            />
          </Field>
        )}
        <Field label="Outer Radius (m)">
          <PreciseNumberInput
            aria-label="Tank outer radius in meters"
            value={tank.outerRadiusM}
            min={0}
            onInteractionStart={push}
            onCommit={(n) => patch({ outerRadiusM: n })}
          />
        </Field>
        <Field label="Wall Thickness (mm)">
          <PreciseNumberInput
            aria-label="Tank wall thickness in millimeters"
            value={tank.wallThicknessMm}
            min={0}
            onInteractionStart={push}
            onCommit={(n) => patch({ wallThicknessMm: n })}
          />
        </Field>

        <DisclosureSection title="Advanced">
          <Field label="Role affinity (which consumer kind this tank prefers to feed)">
            <Select
              size="sm"
              aria-label="Tank role affinity"
              value={tank.roleAffinity}
              onChange={(k) => {
                pushUndo('tank role affinity', String(k));
                patch({ roleAffinity: k as TankRoleAffinity });
              }}
            >
              {ROLE_AFFINITIES.map((role) => (
                <ListBoxItem key={role.id} id={role.id} textValue={role.label}>
                  {role.label}
                </ListBoxItem>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-fg-subtle">Location offset (assembly frame, m)</span>
            <Vec3Field
              value={tank.locationAsmb}
              onInteractionStart={push}
              onCommit={(axis, value) =>
                patch({ locationAsmb: { ...tank.locationAsmb, [axis]: value } })
              }
            />
          </div>
        </DisclosureSection>
      </ItemCard>
    </div>
  );
}
