import { useStore } from '@nanostores/react';
import { Film, Plus } from 'lucide-react';
import { Button, panelChrome } from '../kit';
import { $part } from '../../state/editorStore';
import { runCommand } from '../../state/commandStore';
import { $membersView, addAnimation, openMembersView } from '../../state/animationStore';
import { ClipsSection } from './ClipsSection';
import { JointTreeSection } from './JointTreeSection';
import { EasingOverviewSection } from './EasingOverviewSection';
import { SolarTrackingSection } from './SolarTrackingSection';
import { MembersView } from './MembersView';

/**
 * **The Animation navigator** — Animation mode's right sidebar (design-animation-mode.md §6;
 * foundation §8.2). A slim mode header over four `SidebarSection`s: CLIPS, the JOINTS tree,
 * the EASING overview and SOLAR TRACKING.
 *
 * While `$membersView.open` the body is REPLACED by {@link MembersView} — the docked,
 * non-modal membership editor (design D1). That takeover is why the Members view is a view
 * and not a dialog: the viewport stays live underneath it for painting and layer eyes.
 *
 * **Undo enrollment: NONE of its own** — every section's mutations push their own steps, and
 * opening the Members view is view state.
 */
export function AnimationSidebar() {
  const part = useStore($part);
  const membersView = useStore($membersView);

  if (membersView.open) return <MembersView />;

  return (
    <div className={`${panelChrome} flex h-full min-h-0 flex-col gap-1.5 p-(--density-panel-p)`}>
      <div className="flex flex-none items-center gap-1 px-1">
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Animation
        </span>
        <Button size="xs" variant="ghost" onPress={() => addAnimation()}>
          <Plus className="size-3" /> Clip
        </Button>
        <Button size="xs" variant="ghost" onPress={() => openMembersView()}>
          Members…
        </Button>
      </div>

      {part.animations.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
          <ClipsSection />
          <JointTreeSection />
          <EasingOverviewSection />
          <SolarTrackingSection />
        </div>
      )}
    </div>
  );
}

/** The mode empty state (design §6 intro): what animation IS, plus its two ways in. */
function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-6">
      <Film className="size-5 text-fg-subtle" aria-hidden />
      <p className="text-xs text-fg-subtle">
        Animate parts by attaching SubParts to joints and posing them over a timeline.
      </p>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" onPress={() => addAnimation()}>
          ＋ Animation
        </Button>
        <Button size="sm" variant="secondary" onPress={() => void runCommand('add.builtinPart')}>
          Import a built-in Part…
        </Button>
      </div>
    </div>
  );
}
