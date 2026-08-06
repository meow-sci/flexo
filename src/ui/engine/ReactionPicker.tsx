import { useStore } from '@nanostores/react';
import { ListBoxSection } from 'react-aria-components';
import { Header, ListBoxItem, Select } from '../kit';
import { fuzzyAny } from '../fuzzyMatch';
import { $part } from '../../state/editorStore';
import { $allReactions } from '../../state/reactionStore';
import { KNOWN_REACTIONS, type ReactionCategory } from '../../ksa/types';
import type { ReactionData } from '../../ksa/reactionCatalog';

/**
 * **The reaction (propellant) picker** — design: design-data-engine-modes.md §B5.
 *
 * v1's `ReactionSelect` was a flat dropdown of ids; this is the searchable, grouped picker the
 * design asks for: **Project propellants first** (a just-authored custom reaction appears
 * instantly, because `$allReactions` merges `$part.customReactions` live), then the shipped
 * catalog grouped by Category, each row carrying its category and — for a mixture — the O/F
 * ratio a pick will reset to.
 *
 * Three invariants ride along from v1, all census §5 entries:
 *
 * - **A combustor never offers a Solid reaction** and a solid motor offers ONLY Solid ones:
 *   the wrong family is a hard KSA load error (`SolidMotorTemplate.Create` throws), not a
 *   choice to be validated afterwards.
 * - **A current-but-unknown id stays selectable and labeled**, so an imported part whose
 *   propellant this build has never heard of is never silently retargeted.
 * - **The catalog may be absent** (the open-source build ships no `Reactions.xml`): the static
 *   `KNOWN_REACTIONS` snapshot backs the list and a hint says authoring and export are
 *   unaffected.
 *
 * Picking reports the reaction's `<DefaultMixtureRatio>` alongside its id, because KSA's own
 * designer resets the ratio on pick; the caller commits both in ONE discrete undo step
 * (`setCombustorReaction`) and flashes the ratio field to advertise the reset (§B11).
 *
 * **Undo enrollment: NONE of its own** — the caller's discrete action owns the push.
 */

const CATEGORY_ORDER: readonly ReactionCategory[] = [
  'Bipropellant',
  'Hypergolic',
  'Monopropellant',
  'Solid',
  'Thermal',
];

/** One offered row, normalized across the live catalog and the static fallback. */
interface ReactionOption {
  id: string;
  name: string;
  category: ReactionCategory | null;
  defaultMixtureRatio: number | null;
  isCustom: boolean;
  /** Not in the catalog at all — kept because it is the current value. */
  isUnknown: boolean;
}

/** The default O/F for a just-picked reaction: mixtures reset to theirs, fixed ones to null. */
function defaultRatioFor(id: string, options: readonly ReactionOption[]): number | null {
  return options.find((o) => o.id === id)?.defaultMixtureRatio ?? null;
}

function fromCatalog(entry: ReactionData, customIds: ReadonlySet<string>): ReactionOption {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    defaultMixtureRatio: entry.kind === 'Mixture' ? entry.defaultMixtureRatio : null,
    isCustom: customIds.has(entry.id),
    isUnknown: false,
  };
}

export function ReactionPicker({
  label,
  value,
  kind,
  onPick,
}: {
  label: string;
  value: string;
  /** `combustor` excludes Solid reactions; `solid` offers ONLY Solid ones. */
  kind: 'combustor' | 'solid';
  onPick: (reactionId: string, defaultMixtureRatio: number | null) => void;
}) {
  const catalog = useStore($allReactions);
  const part = useStore($part);

  const customIds = new Set(part.customReactions.map((r) => r.id));
  const hasCatalog = catalog.length > 0;
  const all: ReactionOption[] = hasCatalog
    ? catalog.map((entry) => fromCatalog(entry, customIds))
    : KNOWN_REACTIONS.map((k) => ({
        id: k.id,
        name: k.name,
        category: k.category,
        defaultMixtureRatio: k.defaultMixtureRatio ?? null,
        isCustom: false,
        isUnknown: false,
      }));

  const offered = all.filter((o) =>
    kind === 'solid' ? o.category === 'Solid' : o.category !== 'Solid',
  );
  // The current value always stays pickable, even when it is unknown, a custom solid the
  // static snapshot has never heard of, or the wrong family for this consumer.
  const options = offered.some((o) => o.id === value)
    ? offered
    : value
      ? [
          ...offered,
          {
            id: value,
            name: `${value} — not in the catalog`,
            category: null,
            defaultMixtureRatio: null,
            isCustom: customIds.has(value),
            isUnknown: true,
          },
        ]
      : offered;

  const project = options.filter((o) => o.isCustom || o.isUnknown);
  const shipped = CATEGORY_ORDER.map((category) => ({
    category,
    rows: options.filter((o) => !o.isCustom && !o.isUnknown && o.category === category),
  })).filter((group) => group.rows.length > 0);

  return (
    <Select
      size="sm"
      label={label}
      aria-label={label}
      placeholder="Select a propellant"
      searchable
      searchPlaceholder="Search propellants…"
      // Fuzzy, not substring: "hydro" must find "Hydrogen + Oxygen" (design §B5).
      filter={(textValue, input) => fuzzyAny(input, textValue)}
      popoverClassName="max-h-80"
      value={value || null}
      onChange={(k) => onPick(String(k), defaultRatioFor(String(k), options))}
    >
      {project.length > 0 && (
        <ListBoxSection id="project">
          <GroupHeader>Project propellants</GroupHeader>
          {project.map((option) => (
            <ReactionRow key={option.id} option={option} />
          ))}
        </ListBoxSection>
      )}
      {shipped.map((group) => (
        <ListBoxSection key={group.category} id={group.category}>
          <GroupHeader>{group.category}</GroupHeader>
          {group.rows.map((option) => (
            <ReactionRow key={option.id} option={option} />
          ))}
        </ListBoxSection>
      ))}
      {!hasCatalog && (
        <ListBoxSection id="hint">
          <GroupHeader>
            Full catalog unavailable in this build — authoring and export are unaffected.
          </GroupHeader>
        </ListBoxSection>
      )}
    </Select>
  );
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <Header className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
      {children}
    </Header>
  );
}

function ReactionRow({ option }: { option: ReactionOption }) {
  return (
    <ListBoxItem
      id={option.id}
      // Both the display name and the raw id are searchable: users type either.
      textValue={`${option.name} ${option.id}`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-xs">{option.name}</span>
          {option.category && (
            <span className="shrink-0 rounded border border-border px-1 text-[10px] text-fg-subtle">
              {option.category}
            </span>
          )}
        </span>
        <span className="truncate text-[11px] text-fg-subtle">
          {option.id}
          {option.defaultMixtureRatio != null && ` · O/F ${option.defaultMixtureRatio} default`}
        </span>
      </span>
    </ListBoxItem>
  );
}
