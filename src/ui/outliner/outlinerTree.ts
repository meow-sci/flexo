import type { CatalogSubPart } from '../../ksa/catalog';
import { formatG6 } from '../../ksa/formatG6';
import { seatAxesFromRotation } from '../../ksa/ivaSeatAxes';
import { resolveInternal } from '../../ksa/modExport';
import {
  ENTITY_ONLY_LAYER_IDS,
  type ColliderShape,
  type EditingPart,
  type Layer,
  type LightType,
} from '../../ksa/types';
import { layerViewState, type LayerViewState } from '../../state/layerStore';
import type { EntityKind } from '../../state/editorStore';
import { fuzzyAny, fuzzyFind } from '../fuzzyMatch';

/**
 * The Outliner's row model as a PURE function (design: design-build-mode.md §2.1, §2.4,
 * §2.5). It supersedes v1's inline Assets-list row builders, and lifting it out of the
 * component is what makes the layer partition, the kind grouping, the search semantics and
 * the `shown/total` counts unit-testable without react.
 *
 * No react, no three, no store READS: everything it needs — the document, the layer view
 * map, the query and the catalog index — is passed in, so the panel stays a thin renderer
 * and the compiler sees a plain call.
 */

/** One entity row. `key` is the react-aria row key AND the `kind:id` selection ref. */
export interface OutlinerRow {
  key: string;
  kind: EntityKind;
  id: string;
  /** What the row reads as: instanceId / entity id / "Seat 3" / "Hunter". */
  name: string;
  /** The dim second line: template id, connector flags, collider shape · owner, seat aim… */
  sub: string;
  badges: { interior?: boolean; lightType?: LightType; colliderShape?: ColliderShape };
  /** True when the row's layer is hidden — shown dimmed, but never selectable (matches 3D). */
  hidden: boolean;
  /** Half-open spans of `name` the query matched; empty when it matched elsewhere. */
  matchRanges: [number, number][];
}

/** Rows of one kind under one layer, behind a subheader ("SUBPARTS"). */
export interface OutlinerKindGroup {
  kind: EntityKind;
  label: string;
  rows: OutlinerRow[];
}

/** One layer's slice of the tree: its header state plus its (filtered) kind groups. */
export interface OutlinerLayerSection {
  layer: Layer;
  /** True for the entity-only built-ins (IVA Seats / Lights / Kittens) — they sort last. */
  pinned: boolean;
  view: LayerViewState;
  /** Entities on the layer, before search filtering — the count chip's denominator. */
  total: number;
  /** Entities surviving the search — the chip reads `shown/total` while filtering. */
  shown: number;
  groups: OutlinerKindGroup[];
}

/** Kind subheader order within a layer. Pinned layers only ever fill their own kind. */
const KIND_DISPLAY_ORDER: readonly EntityKind[] = [
  'subpart',
  'connector',
  'collider',
  'ivaSeat',
  'light',
  'kitten',
];

const KIND_LABELS: Record<EntityKind, string> = {
  subpart: 'SUBPARTS',
  connector: 'CONNECTORS',
  collider: 'COLLIDERS',
  ivaSeat: 'IVA SEATS',
  light: 'LIGHTS',
  kitten: 'KITTENS',
};

/** The word a user would type to find rows of this kind ("connector", "seat"). */
const KIND_SEARCH_WORDS: Record<EntityKind, string> = {
  subpart: 'subpart',
  connector: 'connector',
  collider: 'collider',
  ivaSeat: 'seat',
  light: 'light',
  kitten: 'kitten',
};

/** Trailing `_Subpart_Foo` segment of a template id — the part users actually read. */
function lastSegment(id: string): string {
  return id.split('_').pop() || id;
}

/** A row before search has had its say: the display fields plus everything searchable. */
interface Candidate {
  kind: EntityKind;
  id: string;
  name: string;
  sub: string;
  badges: OutlinerRow['badges'];
  /** Extra strings the query may match WITHOUT producing a highlight (name owns that). */
  haystack: string[];
}

export function buildOutlinerTree(
  part: EditingPart,
  layerView: Record<string, LayerViewState>,
  query: string,
  catalogIndex: ReadonlyMap<string, CatalogSubPart>,
): OutlinerLayerSection[] {
  // DISPLAY partition only: ordinary layers first, the pinned entity-only built-ins after
  // (design §2.3.4). `part.layers` keeps its seeded document order — reordering the
  // document to match the view would be an undoable mutation for a cosmetic rule.
  const ordinary = part.layers.filter((l) => !ENTITY_ONLY_LAYER_IDS.includes(l.id));
  const pinned = part.layers.filter((l) => ENTITY_ONLY_LAYER_IDS.includes(l.id));

  return [...ordinary, ...pinned].map((layer) => {
    const view = layerViewState(layerView, layer.id);
    const hidden = !view.visible;
    // "locked" is a searchable flag word, so a locked layer's rows answer `locked`.
    const flagWords = view.locked ? ['locked'] : [];

    let total = 0;
    let shown = 0;
    const groups: OutlinerKindGroup[] = [];

    for (const kind of KIND_DISPLAY_ORDER) {
      const candidates = candidatesFor(part, layer.id, kind, catalogIndex);
      total += candidates.length;
      const rows: OutlinerRow[] = [];
      for (const candidate of candidates) {
        const match = fuzzyFind(query, candidate.name);
        const matched =
          match.matched ||
          fuzzyAny(
            query,
            candidate.id,
            ...candidate.haystack,
            KIND_SEARCH_WORDS[kind],
            ...flagWords,
          );
        if (!matched) continue;
        rows.push({
          key: `${candidate.kind}:${candidate.id}`,
          kind: candidate.kind,
          id: candidate.id,
          name: candidate.name,
          sub: candidate.sub,
          badges: candidate.badges,
          hidden,
          matchRanges: match.matched ? match.ranges : [],
        });
      }
      shown += rows.length;
      // A kind subheader only exists when it has rows (design §2.1).
      if (rows.length > 0) groups.push({ kind, label: KIND_LABELS[kind], rows });
    }

    return {
      layer,
      pinned: ENTITY_ONLY_LAYER_IDS.includes(layer.id),
      view,
      total,
      shown,
      groups,
    };
  });
}

/**
 * Every entity of one kind on one layer, as display candidates. The `sub` strings are
 * ported from v1's Assets list so nothing a user reads today changes.
 */
function candidatesFor(
  part: EditingPart,
  layerId: string,
  kind: EntityKind,
  catalogIndex: ReadonlyMap<string, CatalogSubPart>,
): Candidate[] {
  switch (kind) {
    case 'subpart':
      return part.placements.flatMap((p) => {
        if (p.layerId !== layerId) return [];
        // The RESOLVED <Internal> flag (document override → the built-in's catalogued
        // value): it defaults to the game's own value instead of being normalised away at
        // export, so it has to be visible — and searchable as "interior".
        const interior = resolveInternal(
          part,
          p.subPartTemplateId,
          catalogIndex.get(p.subPartTemplateId),
        );
        return [
          {
            kind,
            id: p.instanceId,
            name: p.instanceId,
            sub: interior ? `${p.subPartTemplateId} · interior` : p.subPartTemplateId,
            badges: interior ? { interior: true } : {},
            haystack: [p.subPartTemplateId, interior ? 'interior' : ''],
          },
        ];
      });

    case 'connector':
      return part.connectors.flatMap((c) =>
        c.layerId !== layerId
          ? []
          : [
              {
                kind,
                id: c.id,
                name: c.id,
                // Flags (how it orients) and capabilities (what may flow across it) are
                // independent axes — show both, e.g. "ToSurface · BulkFluid".
                sub: [...c.flags, ...c.capabilities].join(' · ') || 'no flags',
                badges: {},
                haystack: [...c.flags, ...c.capabilities],
              },
            ],
      );

    case 'collider':
      return part.colliders.flatMap((c) =>
        c.layerId !== layerId
          ? []
          : [
              {
                kind,
                id: c.id,
                name: c.id,
                // Shape plus its owner — a SubPart-owned collider behaves very differently
                // (one per placement, follows animation), so say so.
                sub: `${c.shape} · ${c.ownerTemplateId ? lastSegment(c.ownerTemplateId) : 'Part'}`,
                badges: { colliderShape: c.shape },
                haystack: [c.shape, c.ownerTemplateId ?? ''],
              },
            ],
      );

    // Seats have no user-facing name of their own (their document id is never exported),
    // so the row IS the ordinal — and the order is the game's seat cycle order, with
    // index 0 the seat IVA opens on.
    case 'ivaSeat':
      return part.ivaSeats.flatMap((s, i) => {
        if (s.layerId !== layerId) return [];
        const isDefault = i === 0;
        // The derived <ForwardAxis> — the vector that actually ships in the XML.
        const { forward } = seatAxesFromRotation(s.rotation);
        const aim = `${formatG6(forward.x)}, ${formatG6(forward.y)}, ${formatG6(forward.z)}`;
        return [
          {
            kind,
            id: s.id,
            name: `Seat ${i + 1}`,
            sub: `→ ${aim}${isDefault ? ' · default' : ''}`,
            badges: {},
            haystack: [isDefault ? 'default' : ''],
          },
        ];
      });

    case 'light':
      return part.lights.flatMap((li) =>
        li.layerId !== layerId
          ? []
          : [
              {
                kind,
                id: li.id,
                name: li.id,
                // Type plus its owner — a SubPart-owned light behaves very differently (one
                // marker per placement, edits affect all); a part-level light shows its type.
                sub: li.ownerTemplateId
                  ? `${li.type} · via ${lastSegment(li.ownerTemplateId)}`
                  : li.type,
                badges: { lightType: li.type },
                haystack: [li.type, li.ownerTemplateId ?? ''],
              },
            ],
      );

    case 'kitten':
      return part.kittens.flatMap((k) =>
        k.layerId !== layerId
          ? []
          : [
              {
                kind,
                id: k.id,
                // The kitten IS its kind (design §2.4), so the id moves to the sub line —
                // otherwise three Hunters would render as three identical rows.
                name: k.kind.charAt(0).toUpperCase() + k.kind.slice(1),
                sub: k.id,
                badges: {},
                haystack: [k.kind],
              },
            ],
      );
  }
}
