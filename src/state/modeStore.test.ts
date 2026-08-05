import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import {
  $activeTool,
  $mode,
  armTool,
  disarmTool,
  registerModeHooks,
  registerTool,
  resetModeForProjectLoad,
  setMode,
} from './modeStore';

/**
 * The mode machine's contract (design: `plans/flexo_v2/design/foundation.md` §2).
 *
 * Hook and tool registries are module-scoped and have no unregister — registration is a
 * once-per-session module-scope act — so the fixtures below register ONCE and every test
 * asserts against the shared `calls` log, which `beforeEach` clears. The same `beforeEach`
 * resets `$mode`/`$activeTool` by writing the atoms DIRECTLY, so the reset itself never
 * runs choreography and can't pollute the log.
 */

const calls: string[] = [];

registerModeHooks('build', { onExit: () => calls.push('build:exit') });
registerModeHooks('animation', {
  onEnter: (payload) => calls.push(`animation:enter${payload ? `:${String(payload)}` : ''}`),
  onExit: () => calls.push('animation:exit'),
});
registerModeHooks('engine', { onExit: () => calls.push('engine:exit') });
// Leaving Surface always throws — the "a broken area hook must not strand the UI" case.
registerModeHooks('surface', {
  onExit: () => {
    calls.push('surface:exit');
    throw new Error('boom');
  },
});

registerTool('measure', { onCancel: () => calls.push('measure:cancel') });
registerTool('marquee', { onCancel: () => calls.push('marquee:cancel') });
registerTool('seat-view', {
  survivesModeSwitch: true,
  onCancel: () => calls.push('seat-view:cancel'),
});
registerTool('exhaust', {
  allowedModes: ['engine'],
  onCancel: () => calls.push('exhaust:cancel'),
});

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => {
  consoleError.mockRestore();
});

beforeEach(() => {
  $mode.set('build');
  $activeTool.set(null);
  calls.length = 0;
  consoleError.mockClear();
});

describe('modeStore — $mode', () => {
  it('boots to build', () => {
    // The atom's declared initial value, not the beforeEach reset (which mirrors it).
    expect($mode.get()).toBe('build');
  });

  it('runs the outgoing exit hooks before the incoming enter hooks', () => {
    setMode('animation');
    expect($mode.get()).toBe('animation');
    expect(calls).toEqual(['build:exit', 'animation:enter']);
  });

  it('passes the cross-mode jump payload to the enter hooks', () => {
    setMode('animation', 'jump');
    expect(calls).toEqual(['build:exit', 'animation:enter:jump']);
  });

  it('runs no hooks when the mode is already active', () => {
    setMode('animation');
    calls.length = 0;
    setMode('animation');
    expect(calls).toEqual([]);
  });

  it('still switches when an exit hook throws', () => {
    $mode.set('surface');
    setMode('build');
    expect($mode.get()).toBe('build');
    expect(calls).toEqual(['surface:exit']);
    expect(consoleError).toHaveBeenCalled();
  });
});

describe('modeStore — $activeTool (single slot)', () => {
  it('arming a second tool cancels the first', () => {
    armTool('measure');
    expect($activeTool.get()).toBe('measure');
    armTool('marquee');
    expect($activeTool.get()).toBe('marquee');
    expect(calls).toEqual(['measure:cancel']);
  });

  it('re-arming the armed tool is a no-op', () => {
    armTool('measure');
    calls.length = 0;
    armTool('measure');
    expect(calls).toEqual([]);
    expect($activeTool.get()).toBe('measure');
  });

  it('refuses a tool whose allowedModes exclude the current mode', () => {
    armTool('exhaust');
    expect($activeTool.get()).toBe(null);
    setMode('engine');
    armTool('exhaust');
    expect($activeTool.get()).toBe('exhaust');
  });

  it('disarmTool(tool) is a no-op when a different tool holds the slot', () => {
    armTool('marquee');
    calls.length = 0;
    disarmTool('measure');
    expect($activeTool.get()).toBe('marquee');
    expect(calls).toEqual([]);
    disarmTool();
    expect($activeTool.get()).toBe(null);
    expect(calls).toEqual(['marquee:cancel']);
  });

  it('a mode switch cancels the armed tool', () => {
    armTool('measure');
    setMode('animation');
    expect($activeTool.get()).toBe(null);
    expect(calls).toEqual(['build:exit', 'measure:cancel', 'animation:enter']);
  });

  it('a mode switch keeps a tool declared survivesModeSwitch', () => {
    armTool('seat-view');
    setMode('animation');
    expect($activeTool.get()).toBe('seat-view');
    expect(calls).toEqual(['build:exit', 'animation:enter']);
  });
});

describe('modeStore — resetModeForProjectLoad', () => {
  it('returns to Build, clears the tool slot and runs the outgoing exit hooks', () => {
    setMode('engine');
    armTool('exhaust');
    calls.length = 0;

    resetModeForProjectLoad();

    expect($mode.get()).toBe('build');
    expect($activeTool.get()).toBe(null);
    expect(calls).toEqual(['exhaust:cancel', 'engine:exit']);
  });

  it('is a no-op on mode when already in Build', () => {
    resetModeForProjectLoad();
    expect($mode.get()).toBe('build');
    expect(calls).toEqual([]);
  });
});
