import {
  Checkbox,
  ListBoxItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  noteBox,
} from '../../../kit';
import type { TankShape } from '../../../../ksa/types';
import { feedTargetsOf } from '../../../../state/feedTargets';
import { StepSection, WizardNumberField, WizardRow } from '../wizardFields';
import { DEFAULT_WALL_MATERIAL_ID, WALL_MATERIAL_IDS } from '../wizardPresets';
import type { LiquidWizardState, RcsWizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **Step 3 — Feed** (`plans/ENGINE_WIZARD_PLAN.md` §7.3): where the chamber draws propellant
 * from — a tank the wizard creates, a connector the vehicle plumbs through, or a container
 * the part already carries.
 *
 * Walked by liquid and RCS. The two feed unions agree on the connector and container members
 * and differ on the tank: a liquid tank is shaped and lengthed, an RCS tank is always a
 * sphere. So the tank sub-form is {@link TankFields}, driven by plain values, and each family
 * hands it the fields it actually has — an RCS tank simply passes no shape and no length,
 * which is what removes those two controls.
 */

/** Select sentinel for "the attach node this wizard is about to create" (it has no id yet). */
const WIZARD_NODE_KEY = '\0node';

export function StepFeed({
  state,
  patch,
  part,
}: WizardStepProps<LiquidWizardState | RcsWizardState>) {
  const targets = feedTargetsOf(part);
  const noContainers = targets.containers.length === 0;
  const feed = state.feed;
  // The two tank variants, each narrowed through `state` so its family-specific fields are
  // typed — never through `feed`, which is the union of both.
  const liquidTank = state.family === 'liquid' && state.feed.kind === 'tank' ? state.feed : null;
  const rcsTank = state.family === 'rcs' && state.feed.kind === 'tank' ? state.feed : null;
  // Mirrors `validateWizardStep` exactly: the wizard's own node exists alongside generated
  // geometry, and the RCS walk is the one that can be hosted with no geometry at all.
  const wizardNodeAvailable =
    state.addAttachNode && (state.family === 'liquid' || state.geometry.kind === 'generate');

  const selectTank = () => {
    if (state.family === 'rcs') {
      patch({
        feed: {
          kind: 'tank',
          feedId: 'rcs_prop',
          outerRadiusM: state.gen.blockSizeM / 2,
          wallMaterialId: DEFAULT_WALL_MATERIAL_ID,
        },
      });
      return;
    }
    patch({
      feed: {
        kind: 'tank',
        feedId: 'fuel_main',
        shape: 'Cylindrical',
        lengthM: state.gen.bodyLengthM,
        outerRadiusM: state.gen.bodyCrossM / 2,
        wallMaterialId: DEFAULT_WALL_MATERIAL_ID,
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <StepSection title="Propellant source">
        <ToggleButtonGroup
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[feed.kind]}
          onSelectionChange={(keys) => {
            const k = [...keys][0];
            if (k === 'tank') selectTank();
            else if (k === 'connector') {
              patch({
                feed: {
                  kind: 'connector',
                  connectorId: state.addAttachNode ? null : (part.connectors[0]?.id ?? null),
                },
              });
            } else if (k === 'container') {
              const first = targets.containers[0];
              patch({
                feed: {
                  kind: 'container',
                  containerId: first?.id ?? '',
                  subPartInstanceId: first?.subPartInstanceId ?? null,
                },
              });
            }
          }}
        >
          <ToggleButton id="tank" size="sm">
            New tank
          </ToggleButton>
          <ToggleButton id="connector" size="sm">
            From connector
          </ToggleButton>
          <ToggleButton id="container" size="sm" isDisabled={noContainers}>
            Existing container
          </ToggleButton>
        </ToggleButtonGroup>

        {noContainers && (
          <p className="text-xs leading-snug text-fg-subtle">
            &ldquo;Existing container&rdquo; is unavailable — this part carries no named tank or
            grain segment yet.
          </p>
        )}

        {liquidTank && (
          <TankFields
            feedId={liquidTank.feedId}
            outerRadiusM={liquidTank.outerRadiusM}
            wallMaterialId={liquidTank.wallMaterialId}
            onFeedId={(v) => patch({ feed: { ...liquidTank, feedId: v } })}
            onOuterRadius={(v) => patch({ feed: { ...liquidTank, outerRadiusM: v } })}
            onWallMaterial={(v) => patch({ feed: { ...liquidTank, wallMaterialId: v } })}
            shape={liquidTank.shape}
            onShape={(v) => patch({ feed: { ...liquidTank, shape: v } })}
            lengthM={liquidTank.lengthM}
            onLength={(v) => patch({ feed: { ...liquidTank, lengthM: v } })}
          />
        )}

        {rcsTank && (
          <TankFields
            feedId={rcsTank.feedId}
            outerRadiusM={rcsTank.outerRadiusM}
            wallMaterialId={rcsTank.wallMaterialId}
            onFeedId={(v) => patch({ feed: { ...rcsTank, feedId: v } })}
            onOuterRadius={(v) => patch({ feed: { ...rcsTank, outerRadiusM: v } })}
            onWallMaterial={(v) => patch({ feed: { ...rcsTank, wallMaterialId: v } })}
          />
        )}

        {feed.kind === 'connector' && (
          <>
            <Select
              size="sm"
              label="Connector"
              selectedKey={feed.connectorId ?? WIZARD_NODE_KEY}
              onSelectionChange={(k) => {
                const key = String(k);
                patch({
                  feed: { kind: 'connector', connectorId: key === WIZARD_NODE_KEY ? null : key },
                });
              }}
            >
              {wizardNodeAvailable ? (
                <ListBoxItem id={WIZARD_NODE_KEY} textValue="The new attach node">
                  The new attach node
                </ListBoxItem>
              ) : null}
              {part.connectors.map((connector) => (
                <ListBoxItem key={connector.id} id={connector.id} textValue={connector.id}>
                  {connector.id}
                </ListBoxItem>
              ))}
            </Select>
            {state.family === 'rcs' ? (
              <div className={noteBox}>
                Service plumbing — the default connector capabilities already carry{' '}
                <code>ServiceFluid</code>, so no capability change is needed.
              </div>
            ) : (
              <div className={noteBox}>
                A Bulk-plumbed engine only draws through a connector that declares{' '}
                <code>BulkFluid</code>. The wizard adds that capability to whichever connector you
                pick here.
              </div>
            )}
          </>
        )}

        {feed.kind === 'container' && (
          <Select
            size="sm"
            label="Container"
            selectedKey={feed.containerId || null}
            onSelectionChange={(k) => {
              const id = String(k);
              const option = targets.containers.find((c) => c.id === id);
              patch({
                feed: {
                  kind: 'container',
                  containerId: id,
                  subPartInstanceId: option?.subPartInstanceId ?? null,
                },
              });
            }}
          >
            {targets.containers.map((container) => (
              <ListBoxItem key={container.id} id={container.id} textValue={container.label}>
                {container.label}
              </ListBoxItem>
            ))}
          </Select>
        )}
      </StepSection>

      {state.geometry.kind === 'generate' && (
        <Checkbox isSelected={state.addAttachNode} onChange={(v) => patch({ addAttachNode: v })}>
          Add a forward attach node
        </Checkbox>
      )}
    </div>
  );
}

/**
 * The new-tank sub-form. `shape`/`lengthM` (and their setters) are the LIQUID half: omit them
 * and the shape Select and the length field are gone, which is exactly an RCS thruster's
 * always-spherical propellant sphere.
 */
function TankFields({
  feedId,
  outerRadiusM,
  wallMaterialId,
  onFeedId,
  onOuterRadius,
  onWallMaterial,
  shape,
  onShape,
  lengthM,
  onLength,
}: {
  feedId: string;
  outerRadiusM: number;
  wallMaterialId: string;
  onFeedId: (v: string) => void;
  onOuterRadius: (v: number) => void;
  onWallMaterial: (v: string) => void;
  shape?: TankShape;
  onShape?: (v: TankShape) => void;
  lengthM?: number;
  onLength?: (v: number) => void;
}) {
  return (
    <>
      <TextField
        label="Feed id"
        size="sm"
        inputClassName="font-mono"
        value={feedId}
        onChange={onFeedId}
        description="The container id the engine's <FeedsFrom> will name."
      />
      <WizardRow>
        {shape !== undefined && onShape && (
          <Select
            size="sm"
            label="Shape"
            selectedKey={shape}
            onSelectionChange={(k) => onShape(String(k) as TankShape)}
          >
            <ListBoxItem id="Cylindrical">Cylindrical</ListBoxItem>
            <ListBoxItem id="Spherical">Spherical</ListBoxItem>
          </Select>
        )}
        <Select
          size="sm"
          label="Wall material"
          selectedKey={wallMaterialId}
          onSelectionChange={(k) => onWallMaterial(String(k))}
        >
          {WALL_MATERIAL_IDS.map((id) => (
            <ListBoxItem key={id} id={id} textValue={id}>
              {id}
            </ListBoxItem>
          ))}
        </Select>
      </WizardRow>
      <WizardRow>
        {shape === 'Cylindrical' && lengthM !== undefined && onLength && (
          <WizardNumberField
            label="Length"
            suffix="m"
            value={lengthM}
            onChange={onLength}
            min={0}
            step={0.1}
          />
        )}
        <WizardNumberField
          label="Outer radius"
          suffix="m"
          value={outerRadiusM}
          onChange={onOuterRadius}
          min={0}
          step={0.1}
        />
      </WizardRow>
    </>
  );
}
