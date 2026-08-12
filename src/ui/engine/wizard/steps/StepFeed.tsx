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
import type { LiquidWizardState } from '../wizardModel';
import type { WizardStepProps } from './stepProps';

/**
 * **Step 3 — Feed** (`plans/ENGINE_WIZARD_PLAN.md` §7.3): where the chamber draws propellant
 * from — a tank the wizard creates, a connector the vehicle plumbs through, or a container
 * the part already carries.
 */

/** Select sentinel for "the attach node this wizard is about to create" (it has no id yet). */
const WIZARD_NODE_KEY = '\0node';

export function StepFeed({ state, patch, part }: WizardStepProps<LiquidWizardState>) {
  const targets = feedTargetsOf(part);
  const noContainers = targets.containers.length === 0;
  const feed = state.feed;

  const selectTank = () =>
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

        {feed.kind === 'tank' && (
          <>
            <TextField
              label="Feed id"
              size="sm"
              inputClassName="font-mono"
              value={feed.feedId}
              onChange={(v) => patch({ feed: { ...feed, feedId: v } })}
              description="The container id the engine's <FeedsFrom> will name."
            />
            <WizardRow>
              <Select
                size="sm"
                label="Shape"
                selectedKey={feed.shape}
                onSelectionChange={(k) =>
                  patch({ feed: { ...feed, shape: String(k) as TankShape } })
                }
              >
                <ListBoxItem id="Cylindrical">Cylindrical</ListBoxItem>
                <ListBoxItem id="Spherical">Spherical</ListBoxItem>
              </Select>
              <Select
                size="sm"
                label="Wall material"
                selectedKey={feed.wallMaterialId}
                onSelectionChange={(k) => patch({ feed: { ...feed, wallMaterialId: String(k) } })}
              >
                {WALL_MATERIAL_IDS.map((id) => (
                  <ListBoxItem key={id} id={id} textValue={id}>
                    {id}
                  </ListBoxItem>
                ))}
              </Select>
            </WizardRow>
            <WizardRow>
              {feed.shape === 'Cylindrical' && (
                <WizardNumberField
                  label="Length"
                  suffix="m"
                  value={feed.lengthM}
                  onChange={(v) => patch({ feed: { ...feed, lengthM: v } })}
                  min={0}
                  step={0.1}
                />
              )}
              <WizardNumberField
                label="Outer radius"
                suffix="m"
                value={feed.outerRadiusM}
                onChange={(v) => patch({ feed: { ...feed, outerRadiusM: v } })}
                min={0}
                step={0.1}
              />
            </WizardRow>
          </>
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
              {state.addAttachNode ? (
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
            <div className={noteBox}>
              A Bulk-plumbed engine only draws through a connector that declares{' '}
              <code>BulkFluid</code>. The wizard adds that capability to whichever connector you
              pick here.
            </div>
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
