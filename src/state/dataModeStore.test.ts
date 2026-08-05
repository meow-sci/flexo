import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  $dataFlash,
  $dataHighlight,
  $dataScope,
  $dataScopeRaw,
  $dataSearch,
  $dataSectionJump,
  DATA_FLASH_MS,
  clearFlash,
  flashConnector,
  flashPlacements,
  jumpToSection,
  sectionsFor,
  setDataScope,
  setDataSearch,
} from './dataModeStore';
import { $part } from './editorStore';
import { $mode } from './modeStore';
import { createEmptyPart, DEFAULT_LAYER_ID, identityTransform } from '../ksa/types';
import type { EditingPart } from '../ksa/types';

function partWith(templateIds: string[]): EditingPart {
  const part = createEmptyPart();
  templateIds.forEach((subPartTemplateId, i) =>
    part.placements.push({
      instanceId: `inst_${i + 1}`,
      subPartTemplateId,
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    }),
  );
  return part;
}

beforeEach(() => {
  $part.set(createEmptyPart());
  $dataScopeRaw.set({ kind: 'part' });
  $dataSectionJump.set(null);
  $dataSearch.set('');
  $dataFlash.set(null);
  $mode.set('build');
});

describe('$dataScope', () => {
  it('defaults to Part scope', () => {
    expect($dataScope.get()).toEqual({ kind: 'part' });
  });

  it('passes a template scope through while the template has a placement', () => {
    $part.set(partWith(['TankB']));
    setDataScope({ kind: 'template', templateId: 'TankB' });
    expect($dataScope.get()).toEqual({ kind: 'template', templateId: 'TankB' });
  });

  it('clamps to Part when the last placement of the scoped template disappears — without touching the raw atom', () => {
    $part.set(partWith(['TankB']));
    setDataScope({ kind: 'template', templateId: 'TankB' });

    $part.set(createEmptyPart());

    expect($dataScope.get()).toEqual({ kind: 'part' });
    // The raw scope survives, so undoing the deletion silently restores the form.
    expect($dataScopeRaw.get()).toEqual({ kind: 'template', templateId: 'TankB' });
    $part.set(partWith(['TankB']));
    expect($dataScope.get()).toEqual({ kind: 'template', templateId: 'TankB' });
  });

  it('setDataScope is a no-op when the scope is unchanged', () => {
    $part.set(partWith(['TankB']));
    setDataScope({ kind: 'template', templateId: 'TankB' });
    const before = $dataScopeRaw.get();
    setDataScope({ kind: 'template', templateId: 'TankB' });
    expect($dataScopeRaw.get()).toBe(before);
  });
});

describe('jumpToSection', () => {
  it('bumps the nonce monotonically and carries the card key', () => {
    jumpToSection('tanks');
    expect($dataSectionJump.get()).toEqual({ sectionId: 'tanks', cardKey: undefined, nonce: 1 });
    jumpToSection('tanks', '2');
    expect($dataSectionJump.get()).toEqual({ sectionId: 'tanks', cardKey: '2', nonce: 2 });
    jumpToSection('identity');
    expect($dataSectionJump.get()?.nonce).toBe(3);
  });
});

describe('sectionsFor', () => {
  it('lists the eight Part sections and the five template sections, in form order', () => {
    expect(sectionsFor({ kind: 'part' }).map((s) => s.id)).toEqual([
      'identity',
      'mass',
      'tanks',
      'power',
      'coupling',
      'wiring',
      'advanced',
      'passthrough',
    ]);
    expect(sectionsFor({ kind: 'template', templateId: 'T' }).map((s) => s.id)).toEqual([
      'tanks',
      'lights',
      'solar',
      'engine',
      'passthrough',
    ]);
  });

  it('titles the tanks section with the binding vocabulary', () => {
    expect(sectionsFor({ kind: 'part' })[2].label).toBe('Tanks (feed containers)');
  });
});

describe('$dataSearch', () => {
  it('is a plain ephemeral atom', () => {
    setDataSearch('tank');
    expect($dataSearch.get()).toBe('tank');
  });
});

describe('$dataHighlight', () => {
  it('is empty outside Data mode, even with a template scoped', () => {
    $part.set(partWith(['TankB', 'TankB', 'NoseCone']));
    setDataScope({ kind: 'template', templateId: 'TankB' });
    expect($dataHighlight.get()).toEqual([]);
  });

  it('lists every placement of the scoped template while in Data mode', () => {
    $part.set(partWith(['TankB', 'NoseCone', 'TankB']));
    setDataScope({ kind: 'template', templateId: 'TankB' });
    $mode.set('data');
    expect($dataHighlight.get()).toEqual(['inst_1', 'inst_3']);
  });

  it('is empty at Part scope', () => {
    $part.set(partWith(['TankB']));
    $mode.set('data');
    expect($dataHighlight.get()).toEqual([]);
  });
});

describe('flashPlacements', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sets a nonce’d flash and clears it after the flash window', () => {
    flashPlacements(['inst_1', 'inst_2']);
    expect($dataFlash.get()).toEqual({
      instanceIds: ['inst_1', 'inst_2'],
      connectorIds: [],
      nonce: 1,
    });

    vi.advanceTimersByTime(DATA_FLASH_MS);
    expect($dataFlash.get()).toBe(null);
  });

  it('flashes a connector in its own id space, leaving placements untouched', () => {
    flashConnector('_connector1');
    expect($dataFlash.get()).toEqual({
      instanceIds: [],
      connectorIds: ['_connector1'],
      nonce: 1,
    });

    vi.advanceTimersByTime(DATA_FLASH_MS);
    expect($dataFlash.get()).toBe(null);
  });

  it('re-flashing the same set bumps the nonce, and a second flash resets the timer', () => {
    flashPlacements(['inst_1']);
    vi.advanceTimersByTime(DATA_FLASH_MS - 100);
    flashPlacements(['inst_1']);
    expect($dataFlash.get()?.nonce).toBe(2);

    vi.advanceTimersByTime(DATA_FLASH_MS - 100);
    expect($dataFlash.get()).not.toBe(null); // the first timer must not blank the second flash
    vi.advanceTimersByTime(100);
    expect($dataFlash.get()).toBe(null);
  });

  it('clearFlash drops a live flash immediately', () => {
    flashPlacements(['inst_1']);
    clearFlash();
    expect($dataFlash.get()).toBe(null);
  });
});
