import { Button, ItemCard, SectionTitle } from '../../kit';
import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import { EngineModeBanner, EngineModeLink } from '../EngineModeLink';
import { ControllerEditor } from '../../engine/ControllerEditor';
import { FeedWiringEditor } from '../../engine/FeedWiringEditor';
import { AddGimbalField, GimbalEditor } from '../../engine/GimbalEditor';
import {
  addRocketController,
  removeGimbal,
  removeRocketController,
  undo,
} from '../../../state/editorStore';
import { status } from '../../../state/statusStore';
import type { EditingPart } from '../../../ksa/types';

/**
 * **Wiring** — the part-level plumbing and thrust-vectoring hardware: rocket controllers,
 * `<ConsumerFeedWiring>` entries (with auto-wire) and gimbals (design: §A4.1 Wiring, D9,
 * D10; census `engines.md` §1.9).
 *
 * The bodies are the SAME components Engine mode's module editor renders — `ControllerEditor`,
 * `FeedWiringEditor`, `GimbalEditor` — which is what makes D11 ("the two views can never
 * diverge in capability") structural rather than aspirational: there is one implementation and
 * two entrances, and the cross-link banner names the other one.
 *
 * The D10 capabilities mirror comes along inside `FeedWiringEditor`: read-only, because the
 * connector inspector in Build stays the single editor for that field.
 *
 * **Undo enrollment**: discrete adds/removes push internally, `autoWireUnwiredConsumers` is one
 * `'auto-wire consumers'` push, field edits stream.
 */
export function WiringSection({ part, meta }: { part: EditingPart; meta: SectionMeta }) {
  const gimbals = part.gameData.gimbals;
  const freeInstances = part.placements
    .map((p) => p.instanceId)
    .filter((id) => !gimbals.some((g) => g.subPartInstanceId === id));

  return (
    <DataSection
      sectionId="wiring"
      count={meta.count}
      issue={meta.issue}
      headerAction={<EngineModeLink scope={{ kind: 'part' }} />}
    >
      <EngineModeBanner
        scope={{ kind: 'part' }}
        text="The same editors live in Engine mode, alongside the module tree and live performance."
      />

      <div className="flex flex-col gap-2">
        <SectionTitle>Controllers</SectionTitle>
        {part.gameData.rocketControllers.map((controller, i) => (
          <ItemCard
            key={i}
            title={`${controller.kind === 'thruster' ? 'Thruster' : 'Engine'} — ${controller.id}`}
            onRemove={() => {
              removeRocketController(i);
              status(`Removed controller ${controller.id}`, {
                severity: 'info',
                action: { label: 'Undo', run: undo },
              });
            }}
          >
            <ControllerEditor index={i} />
          </ItemCard>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onPress={() => addRocketController('engine')}>
            + Engine controller
          </Button>
          <Button size="sm" onPress={() => addRocketController('thruster')}>
            + RCS controller
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle>Feed wiring</SectionTitle>
        <FeedWiringEditor />
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle>Gimbals</SectionTitle>
        {gimbals.map((gimbal, i) => (
          <ItemCard
            key={gimbal.subPartInstanceId}
            title={`Gimbal — ${gimbal.subPartInstanceId}`}
            onRemove={() => {
              removeGimbal(gimbal.subPartInstanceId);
              status(`Removed gimbal on ${gimbal.subPartInstanceId}`, {
                severity: 'info',
                action: { label: 'Undo', run: undo },
              });
            }}
          >
            {/* One add-select for the whole list, below — not one per card. */}
            <GimbalEditor index={i} showAdd={false} />
          </ItemCard>
        ))}
        {freeInstances.length > 0 && <AddGimbalField instanceIds={freeInstances} />}
      </div>
    </DataSection>
  );
}
