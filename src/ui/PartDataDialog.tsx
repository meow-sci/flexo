import { useStore } from '@nanostores/react';
import {
  Modal,
  Dialog,
  DialogHeader,
  DisclosureSection,
  SectionTitle,
  TextField,
  useIsPhone,
} from './kit';
import { $part, pushUndo, setEditorTags, setPartId } from '../state/editorStore';
import { EditorTagsField } from './EditorTagsField';
import {
  CouplingSection,
  IdentityFields,
  MassSection,
  PowerSection,
  SizeControlFields,
  TanksSection,
} from './GameDataSections';
import {
  ConsumerFeedWiringSection,
  GimbalsSection,
  PartGasGeneratorSection,
  PartSolidMotorSection,
  RocketControllersSection,
} from './EngineSections';
import { EngineIssuesPanel } from './EngineIssuesPanel';

/**
 * "Part Data" — the Part-level KSA GameData authoring form, root-hosted by `DialogRoot`
 * under the dialog id `'part-data'`. Guts are v1 verbatim; the Data mode rehost replaces
 * this dialog wholesale, so do not restructure it here.
 */
export function PartDataDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isPhone = useIsPhone();
  const part = useStore($part);
  const { gameData } = part;

  const powerCount =
    gameData.batteries.length +
    gameData.generators.length +
    gameData.solarPanels.length +
    (gameData.powerConsumer ? 1 : 0);
  const couplingCount =
    (gameData.decoupler ? 1 : 0) + (gameData.dockingPort ? 1 : 0) + (gameData.evaDoor ? 1 : 0);
  const engineCount =
    gameData.rocketControllers.length +
    gameData.gimbals.length +
    gameData.rockets.length +
    gameData.combustors.length +
    gameData.nozzles.length +
    gameData.consumerFeedWiring.length +
    gameData.solidMotors.length +
    gameData.solidNozzles.length +
    gameData.solidGrainSegments.length;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      variant={isPhone ? 'cover' : 'fullscreen'}
    >
      <Dialog className="min-h-0 flex-1">
        <DialogHeader title="Part Data" onClose={() => onOpenChange(false)} />
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-4">
          <DisclosureSection title="Identity" defaultExpanded>
            <label className="flex flex-col gap-1">
              <SectionTitle>Part Id</SectionTitle>
              <TextField
                size="sm"
                value={part.partId}
                inputClassName="font-mono"
                aria-label="Part Id"
                onFocus={() => pushUndo('edit part ID', part.partId)}
                onChange={(v) => setPartId(v)}
                placeholder="part_id"
              />
            </label>
            <IdentityFields gameData={gameData} />
            <div className="flex flex-col gap-1">
              <SectionTitle>Editor Tags</SectionTitle>
              <EditorTagsField tags={part.editorTags} onChange={setEditorTags} />
            </div>
            <SizeControlFields gameData={gameData} />
          </DisclosureSection>

          <DisclosureSection title="Mass" defaultExpanded>
            <MassSection gameData={gameData} />
          </DisclosureSection>

          <DisclosureSection title="Tanks" badge={gameData.tanks.length || ''} defaultExpanded>
            {/* Part-level <Tank>s — where Core authors its prefab tank data, and the
                only level an engine can address without a SubPart= scope. */}
            <TanksSection tanks={gameData.tanks} subPartTemplateId={null} />
          </DisclosureSection>

          <DisclosureSection title="Power" badge={powerCount || ''} defaultExpanded>
            <PowerSection gameData={gameData} />
          </DisclosureSection>

          <DisclosureSection title="Coupling" badge={couplingCount || ''} defaultExpanded>
            <CouplingSection part={part} />
          </DisclosureSection>

          <DisclosureSection title="Engine" badge={engineCount || ''}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <SectionTitle>Controllers</SectionTitle>
                <RocketControllersSection part={part} />
              </div>
              <div className="flex flex-col gap-2">
                <SectionTitle>Feed wiring</SectionTitle>
                <ConsumerFeedWiringSection part={part} />
              </div>
              <div className="flex flex-col gap-2">
                <SectionTitle>Gimbals</SectionTitle>
                <GimbalsSection part={part} />
              </div>
              <EngineIssuesPanel part={part} />
              <DisclosureSection title="Solid motor (SRB)">
                <PartSolidMotorSection part={part} />
              </DisclosureSection>
              <DisclosureSection title="Gas generator (advanced, part-level rockets)">
                <PartGasGeneratorSection part={part} />
              </DisclosureSection>
            </div>
          </DisclosureSection>
        </div>
      </Dialog>
    </Modal>
  );
}
