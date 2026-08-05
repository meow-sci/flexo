import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushUndo } from './editorStore';
import {
  $advisories,
  $progress,
  $statusMessage,
  clearAdvisory,
  clearStatus,
  setAdvisory,
  STATUS_DURATION,
  status,
  trackJob,
  undoStatusAction,
} from './statusStore';

beforeEach(() => {
  vi.useFakeTimers();
  clearStatus();
  $advisories.set([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('status message channel', () => {
  it('posts a message with its severity and expiry stamp', () => {
    status('Nudge axis: Y');
    const message = $statusMessage.get();
    expect(message?.text).toBe('Nudge axis: Y');
    expect(message?.severity).toBe('info');
    expect(message?.expiresAt).toBe(Date.now() + STATUS_DURATION.info);
  });

  it('OVERWRITES rather than queueing — a single slot (design §1.2 #5)', () => {
    status('first');
    status('second');
    expect($statusMessage.get()?.text).toBe('second');
  });

  it("re-arms expiry on overwrite: the old message's timer never blanks the new one", () => {
    status('first');
    vi.advanceTimersByTime(3000);
    status('second');
    // The first message's 4s deadline passes here — it must not clear anything.
    vi.advanceTimersByTime(1500);
    expect($statusMessage.get()?.text).toBe('second');
    // ...and the SECOND message still gets its own full duration.
    vi.advanceTimersByTime(STATUS_DURATION.info - 1500);
    expect($statusMessage.get()).toBeNull();
  });

  it('nulls the slot on expiry', () => {
    status('gone soon');
    vi.advanceTimersByTime(STATUS_DURATION.info);
    expect($statusMessage.get()).toBeNull();
  });

  it.each([
    ['info', STATUS_DURATION.info],
    ['success', STATUS_DURATION.success],
    ['warning', STATUS_DURATION.warning],
    ['danger', STATUS_DURATION.danger],
  ] as const)('holds a %s message for its table duration', (severity, duration) => {
    status('x', { severity });
    vi.advanceTimersByTime(duration - 1);
    expect($statusMessage.get()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect($statusMessage.get()).toBeNull();
  });

  it('clearStatus empties the slot immediately and disarms the timer', () => {
    status('x');
    clearStatus();
    expect($statusMessage.get()).toBeNull();
    status('y');
    vi.advanceTimersByTime(STATUS_DURATION.info - 1);
    expect($statusMessage.get()?.text).toBe('y');
  });

  it('carries an inline action and a notification id', () => {
    const run = vi.fn();
    status('Deleted 3 SubParts', {
      severity: 'success',
      action: { label: 'Undo', run },
      notificationId: 'n1',
    });
    $statusMessage.get()?.action?.run();
    expect(run).toHaveBeenCalledOnce();
    expect($statusMessage.get()?.notificationId).toBe('n1');
  });
});

describe('undoStatusAction', () => {
  it('goes stale (disabled) once another undo step is pushed', () => {
    pushUndo('move', 'thruster_1');
    const action = undoStatusAction();
    expect(action.disabled?.()).toBe(false);
    pushUndo('rotate', 'thruster_1');
    expect(action.disabled?.()).toBe(true);
  });
});

describe('advisories', () => {
  it('adds, replaces by id, and sorts by ascending priority', () => {
    setAdvisory({ id: 'b', text: 'second', severity: 'warning', priority: 20 });
    setAdvisory({ id: 'a', text: 'first', severity: 'warning', priority: 10 });
    expect($advisories.get().map((a) => a.id)).toEqual(['a', 'b']);

    setAdvisory({ id: 'a', text: 'first (updated)', severity: 'warning', priority: 30 });
    expect($advisories.get().map((a) => a.id)).toEqual(['b', 'a']);
    expect($advisories.get()[1].text).toBe('first (updated)');
  });

  it('clears by id and ignores unknown ids', () => {
    setAdvisory({ id: 'a', text: 'x', severity: 'warning', priority: 10 });
    clearAdvisory('nope');
    expect($advisories.get()).toHaveLength(1);
    clearAdvisory('a');
    expect($advisories.get()).toHaveLength(0);
  });
});

describe('progress aggregate', () => {
  it('is inactive with nothing in flight', () => {
    expect($progress.get()).toEqual({ active: false, percent: null, jobs: [] });
  });

  it('tracks a job through its lifecycle', () => {
    const job = trackJob('Building archive');
    expect($progress.get().jobs).toHaveLength(1);
    expect($progress.get().active).toBe(true);
    // No total yet ⇒ indeterminate.
    expect($progress.get().percent).toBeNull();

    job.setProgress(25, 100);
    expect($progress.get().percent).toBe(25);
    // A later report without a total keeps the one already known.
    job.setProgress(50);
    expect($progress.get().percent).toBe(50);

    job.end();
    expect($progress.get().jobs).toHaveLength(0);
    expect($progress.get().active).toBe(false);
  });

  it('byte-weights the mean across two determinate jobs', () => {
    const small = trackJob('small');
    const big = trackJob('big');
    small.setProgress(100, 100);
    big.setProgress(0, 300);
    // 100 of 400 bytes — NOT the 50% a per-job mean would give.
    expect($progress.get().percent).toBe(25);
    small.end();
    big.end();
  });

  it('ignores an indeterminate job when a determinate sibling exists', () => {
    const determinate = trackJob('known');
    const unknown = trackJob('unknown');
    determinate.setProgress(50, 100);
    expect($progress.get().percent).toBe(50);
    expect($progress.get().jobs).toHaveLength(2);
    determinate.end();
    unknown.end();
  });
});
