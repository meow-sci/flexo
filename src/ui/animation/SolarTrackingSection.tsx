import { useStore } from '@nanostores/react';
import { Button, ListBoxItem, Select, Switch, Tooltip } from '../kit';
import { NumberField } from '../NumberField';
import {
  $activeAnimation,
  $clipIssues,
  setAnimationMode,
  setSolarTracking,
} from '../../state/animationStore';
import { AnimSection } from './AnimSection';
import { ownershipOf } from './membershipModel';
import { templateCaption } from '../subPartSetModel';
import { $part } from '../../state/editorStore';

/**
 * **The SOLAR TRACKING section** (design-animation-mode.md §6.4; census §1.14 semantics kept
 * verbatim — a `<SolarTracking DegreesPerSecond SubPart>` passthrough with an `<ExcludeSubPart>`
 * list, legal only on a Deploy/Retract clip).
 *
 * The one behavioural change is READABILITY (census pain 12): v1 offered a raw Select of
 * generated instance ids, which is unusable on an imported part. Every member now reads
 * `panel_a_1 · SolarPanelA · → HingeL`.
 *
 * **Undo enrollment:** `setSolarTracking` is discrete and replaces the whole spec — the v1
 * contract, kept deliberately. The °/s field therefore commits discretely per edit rather than
 * streaming (one step per committed value, which is what a whole-spec replace can express).
 */
export function SolarTrackingSection() {
  const anim = useStore($activeAnimation);
  const part = useStore($part);
  const issues = useStore($clipIssues);
  if (!anim) return null;

  const spec = anim.solarTracking;
  const ownership = ownershipOf(anim);
  const members = anim.joints.flatMap((j) => j.memberInstanceIds);
  const dangling = (issues[anim.id] ?? []).some((i) => i.id === 'solar-target-missing');

  const label = (instanceId: string): string => {
    const placement = part.placements.find((p) => p.instanceId === instanceId);
    const caption = placement ? templateCaption(placement.subPartTemplateId) : 'missing';
    const joint = ownership.get(instanceId)?.jointName;
    return `${instanceId} · ${caption}${joint ? ` · → ${joint}` : ''}`;
  };

  return (
    <AnimSection id="solar" title="Solar tracking" defaultExpanded={!!spec}>
      {anim.mode !== 'deployRetract' ? (
        <div className="flex items-center gap-2 px-1 text-xs text-fg-subtle">
          <span className="min-w-0 flex-1">Solar tracking requires Deploy/Retract mode</span>
          <Button
            size="xs"
            variant="secondary"
            onPress={() => setAnimationMode(anim.id, 'deployRetract')}
          >
            Switch mode
          </Button>
        </div>
      ) : (
        <>
          <Switch
            isSelected={!!spec}
            onChange={(on) =>
              setSolarTracking(
                anim.id,
                on
                  ? {
                      degreesPerSecond: 5,
                      subPartInstanceId: members[0] ?? '',
                      excludeInstanceIds: [],
                    }
                  : null,
              )
            }
          >
            Sun tracking (solar panel)
          </Switch>
          {spec && (
            <>
              <div className="flex items-end gap-2">
                <Select
                  size="xs"
                  className="min-w-0 flex-1"
                  label="Rotates to track"
                  searchable
                  searchPlaceholder="Search members…"
                  placeholder={members.length > 0 ? 'Pick a member' : 'No members yet'}
                  value={spec.subPartInstanceId || null}
                  onChange={(key) =>
                    setSolarTracking(anim.id, { ...spec, subPartInstanceId: String(key) })
                  }
                >
                  {members.map((id) => (
                    <ListBoxItem key={id} id={id} textValue={label(id)}>
                      <span className="font-mono text-xs">{label(id)}</span>
                    </ListBoxItem>
                  ))}
                </Select>
                <div className="w-20">
                  <NumberField
                    label="°"
                    ariaLabel="Degrees per second"
                    value={spec.degreesPerSecond}
                    onCommit={(n) => setSolarTracking(anim.id, { ...spec, degreesPerSecond: n })}
                  />
                </div>
              </div>
              {dangling && (
                <Tooltip content="The tracked SubPart is gone or is no longer a joint member — re-pick it.">
                  <span className="w-fit rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">
                    target missing — re-pick
                  </span>
                </Tooltip>
              )}
              {members.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-fg-subtle">Stays fixed (doesn’t track):</span>
                  {members.map((id) => (
                    <Switch
                      key={id}
                      isSelected={spec.excludeInstanceIds.includes(id)}
                      onChange={(on) =>
                        setSolarTracking(anim.id, {
                          ...spec,
                          excludeInstanceIds: on
                            ? [...spec.excludeInstanceIds, id]
                            : spec.excludeInstanceIds.filter((x) => x !== id),
                        })
                      }
                    >
                      <span className="text-xs">{label(id)}</span>
                    </Switch>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </AnimSection>
  );
}
