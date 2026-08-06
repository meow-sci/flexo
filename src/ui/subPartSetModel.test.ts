import { describe, it, expect } from 'vitest';
import { createEmptyPart, type EditingPart, type SubPartPlacement } from '../ksa/types';
import { DEFAULT_LAYER_STATE, type LayerViewState } from '../state/layerStore';
import {
  buildSubPartSetSections,
  enabledRowIds,
  sectionCheckState,
  templateCaption,
  type SubPartOwner,
} from './subPartSetModel';

/**
 * The pure half of the shared SubPart Set Picker (foundation §10.11): layer grouping, the
 * four filter chips, the fuzzy search and the header tri-state. The component around it is
 * covered manually (design-animation-mode.md §7).
 */

function placement(instanceId: string, layerId: string, templateId = 'Core_Subpart_PanelA') {
  return {
    instanceId,
    subPartTemplateId: templateId,
    layerId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  } satisfies SubPartPlacement;
}

function part(): EditingPart {
  const base = createEmptyPart();
  return {
    ...base,
    layers: [
      { id: 'hull', name: 'Hull' },
      { id: 'wings', name: 'Wings' },
      ...base.layers.filter((l) => l.id !== 'hull' && l.id !== 'wings'),
    ],
    placements: [
      placement('panel_a_1', 'hull'),
      placement('panel_a_2', 'hull'),
      placement('strut_1', 'hull', 'Core_Subpart_StrutS'),
      placement('wing_1', 'wings', 'Core_Subpart_WingB'),
    ],
  };
}

const OWNERSHIP = new Map<string, SubPartOwner>([
  ['panel_a_1', { jointId: 'j1', jointName: 'HingeL' }],
  ['strut_1', { jointId: 'j2', jointName: 'HingeR' }],
]);

function build(
  over: Partial<Parameters<typeof buildSubPartSetSections>[0]> = {},
  layerView: Record<string, LayerViewState> = {},
) {
  return buildSubPartSetSections({
    part: part(),
    layerView,
    ownership: OWNERSHIP,
    conflictClips: new Map(),
    targetJointId: 'j1',
    search: '',
    filter: 'all',
    ...over,
  });
}

describe('buildSubPartSetSections', () => {
  it('groups by layer, skips layers with no SubParts, and counts assignments', () => {
    const sections = build();
    expect(sections.map((s) => s.layer.id)).toEqual(['hull', 'wings']);
    expect(sections[0].total).toBe(3);
    expect(sections[0].assigned).toBe(2);
    expect(sections[1].assigned).toBe(0);
  });

  it('includes UNLISTED layers — the picker must see everything (§7.3)', () => {
    const sections = build({}, { wings: { ...DEFAULT_LAYER_STATE, listed: false } });
    expect(sections.map((s) => s.layer.id)).toContain('wings');
  });

  it('marks locked rows disabled and hidden rows dimmed-but-assignable', () => {
    const sections = build(
      {},
      {
        hull: { ...DEFAULT_LAYER_STATE, locked: true },
        wings: { ...DEFAULT_LAYER_STATE, visible: false },
      },
    );
    expect(sections[0].rows.every((r) => r.disabled)).toBe(true);
    expect(sections[1].rows.every((r) => r.dimmed && !r.disabled)).toBe(true);
  });

  it('filters by ownership relative to the target joint', () => {
    expect(build({ filter: 'unassigned' }).flatMap((s) => s.rows.map((r) => r.instanceId))).toEqual(
      ['panel_a_2', 'wing_1'],
    );
    expect(build({ filter: 'this' }).flatMap((s) => s.rows.map((r) => r.instanceId))).toEqual([
      'panel_a_1',
    ]);
    expect(build({ filter: 'other' }).flatMap((s) => s.rows.map((r) => r.instanceId))).toEqual([
      'strut_1',
    ]);
  });

  it('fuzzy-searches instance id, template id, caption, layer name and owning joint', () => {
    const ids = (search: string) =>
      build({ search }).flatMap((s) => s.rows.map((r) => r.instanceId));
    expect(ids('wing')).toEqual(['wing_1']); // layer name AND caption
    expect(ids('strt')).toEqual(['strut_1']); // subsequence, not substring
    expect(ids('HingeR')).toEqual(['strut_1']); // owning joint
    expect(ids('zzz')).toEqual([]);
  });

  it('carries the ownership + conflict chips onto the row', () => {
    const sections = build({ conflictClips: new Map([['panel_a_2', 'Sweep']]) });
    const rows = sections[0].rows;
    expect(rows[0].owner?.jointName).toBe('HingeL');
    expect(rows[1].owner).toBeNull();
    expect(rows[1].conflictClip).toBe('Sweep');
  });
});

describe('sectionCheckState (the header tri-state)', () => {
  const sections = build({}, { hull: { ...DEFAULT_LAYER_STATE } });

  it('is unchecked with nothing checked', () => {
    const state = sectionCheckState(sections[0], new Set());
    expect(state).toMatchObject({ checked: false, indeterminate: false });
    expect(state.enabledIds).toHaveLength(3);
  });

  it('is indeterminate part-way and checked when every ENABLED row is checked', () => {
    expect(sectionCheckState(sections[0], new Set(['panel_a_1']))).toMatchObject({
      checked: false,
      indeterminate: true,
    });
    expect(
      sectionCheckState(sections[0], new Set(['panel_a_1', 'panel_a_2', 'strut_1'])),
    ).toMatchObject({ checked: true, indeterminate: false });
  });

  it('ignores locked rows entirely — a fully locked section can never be checked', () => {
    const locked = build({}, { hull: { ...DEFAULT_LAYER_STATE, locked: true } })[0];
    const state = sectionCheckState(locked, new Set(['panel_a_1']));
    expect(state.enabledIds).toEqual([]);
    expect(state).toMatchObject({ checked: false, indeterminate: false });
  });
});

describe('helpers', () => {
  it('captions a template by its trailing segment', () => {
    expect(templateCaption('CoreStructuralA_Subpart_TrussBarA')).toBe('TrussBarA');
    expect(templateCaption('Plain')).toBe('Plain');
  });

  it('enabledRowIds spans sections in display order', () => {
    expect(enabledRowIds(build())).toEqual(['panel_a_1', 'panel_a_2', 'strut_1', 'wing_1']);
  });
});
