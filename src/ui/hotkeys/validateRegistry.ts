import { allCommands, getCommand } from '../../state/commandStore';
import { MODES, TOOLS } from '../../state/modeStore';
import { SURFACE_IDS } from '../../state/hotkeyStore';
import { isBareLetterOrDigit, normalizeKeys, scopeRank } from './keys';
import { escRungs } from './escLadder';
import type { HotkeyBinding } from './registry';

/**
 * Conflict detection for the scoped hotkey registry (design:
 * `plans/flexo_v2/design/design-system-services.md` §4.5). Run at module init in DEV and
 * from the unit suite, it makes "the registry rejects duplicate keys within one active set"
 * a mechanical guarantee instead of a comment.
 *
 * It asserts, over the WHOLE registry:
 * 1. every `keys` string parses to at least one chord, and every binding has chords;
 * 2. binding ids are unique, and each is a registered command or a documented synthetic id;
 * 3. `escRung` values are unique, and the registered Escape rungs are strictly ordered;
 * 4. **no bare-letter/digit binding can be enabled while an overlay dialog is open** (the
 *    "C5 fix" class of regressions — a mode digit or a tool letter firing invisibly behind
 *    the Project Manager);
 * 5. in every reachable active-scope combination, no two bindings of the SAME precedence
 *    rank share a normalized key string unless one names the other in `overrides`
 *    (different ranks are resolved by precedence, not a conflict).
 *
 * Throws one Error listing every problem found — collecting them all beats fixing them one
 * reload at a time.
 */

/**
 * Binding ids that are deliberately NOT commands, beyond the synthetic `transform.*` family
 * (pure-key viewport behaviors with no menu home).
 *
 * - `esc.ladder` — the Escape dispatcher itself; its RUNGS are the user-facing actions.
 * - `chain.apply` — only meaningful inside a live chain session, which the palette already
 *   reaches through `chain.begin`.
 * - `outliner.search` — focuses a field inside the panel that already has focus. As a
 *   command it would be a palette row that runs, closes the palette and then focuses
 *   whatever the palette handed focus back to: a promise the surface cannot keep. Help
 *   lists it from the binding, under `surface:outliner`, which is where it belongs.
 * - `glowPaint.undo` / `glowPaint.redo` — they step the glow painter's DIALOG-LOCAL stroke
 *   stack, which only exists while that dialog is mounted. As palette rows they would be two
 *   permanently-dead entries whose one live moment is behind a modal the palette cannot open
 *   over. Help lists them from the bindings, under `surface:glow-paint`.
 */
const SYNTHETIC_BINDING_IDS: readonly string[] = [
  'esc.ladder',
  'chain.apply',
  'outliner.search',
  'glowPaint.undo',
  'glowPaint.redo',
];

/**
 * `anim.*` (the Animation-mode transport keys) and `timeline.*` (the dopesheet surface) are
 * synthetic for the same reason `transform.*` is: they act on the playhead and the column
 * selection of a surface that must already be focused, so a palette row could not deliver
 * them (11E adds the handful that CAN work from the palette — "Insert keyframe at playhead",
 * "Play/Pause preview" — as real commands, and those bindings will be re-pointed at them).
 * Help lists them from the bindings, under "Animation mode" and "Timeline".
 */
function isAnimationSyntheticId(id: string): boolean {
  return id.startsWith('anim.') || id.startsWith('timeline.');
}

/**
 * `mirror.<surface>.<action>` — a list-surface edit mirror (`listSurfaceMirrors.ts`). It
 * needs its own id because two bindings can never share one (rule 2), but it runs the very
 * command its viewport twin does, so there is nothing extra to register.
 */
function isSyntheticId(id: string): boolean {
  return (
    id.startsWith('transform.') ||
    id.startsWith('mirror.') ||
    isAnimationSyntheticId(id) ||
    SYNTHETIC_BINDING_IDS.includes(id)
  );
}

/**
 * Every scope set the app can actually be in: global always, viewport unless an overlay is
 * up, exactly one mode, at most one tool, at most one focused surface, plus `surface:chain`
 * whenever a chain session exists (it follows the session, not focus). Mirrors
 * `hotkeyStore.$activeScopes` exactly — if that computed changes, this must too.
 */
export function reachableScopeSets(): Set<string>[] {
  const sets: Set<string>[] = [];
  for (const mode of MODES) {
    for (const tool of [null, ...TOOLS]) {
      for (const surface of [null, ...SURFACE_IDS]) {
        for (const chain of [false, true]) {
          for (const dialogOpen of [false, true]) {
            const scopes = new Set<string>(['global', `mode:${mode.id}`]);
            if (!dialogOpen) scopes.add('viewport');
            if (tool) scopes.add(`tool:${tool}`);
            if (surface) scopes.add(`surface:${surface}`);
            if (chain) scopes.add('surface:chain');
            sets.push(scopes);
          }
        }
      }
    }
  }
  return sets;
}

export function validateRegistry(bindings: readonly HotkeyBinding[]): void {
  const problems: string[] = [];

  // 1 — parseable keys + chords.
  const chordsOf = new Map<HotkeyBinding, string[]>();
  for (const binding of bindings) {
    const chords = normalizeKeys(binding.keys);
    chordsOf.set(binding, chords);
    if (chords.length === 0) problems.push(`${binding.id}: keys parse to nothing`);
    if (binding.chords.length === 0) problems.push(`${binding.id}: no display chords`);
  }

  // 2 — ids: unique, and backed by a command unless documented synthetic.
  const seen = new Set<string>();
  for (const binding of bindings) {
    if (seen.has(binding.id)) problems.push(`${binding.id}: duplicate binding id`);
    seen.add(binding.id);
  }
  // An EMPTY command registry means the command modules were never imported (a unit test
  // exercising the registry in isolation), not that every id is wrong.
  if (allCommands().length > 0) {
    for (const binding of bindings) {
      if (isSyntheticId(binding.id) || getCommand(binding.id)) continue;
      problems.push(`${binding.id}: no such command (and not a documented synthetic id)`);
    }
  }

  // 3 — Esc-ladder ordering.
  const declaredRungs = bindings.flatMap((b) => (b.escRung === undefined ? [] : [b.escRung]));
  if (new Set(declaredRungs).size !== declaredRungs.length) {
    problems.push(`escRung values are not unique: [${declaredRungs.join(', ')}]`);
  }
  const ladder = escRungs();
  for (let i = 1; i < ladder.length; i++) {
    if (ladder[i].rung <= ladder[i - 1].rung) {
      problems.push(`Esc ladder is out of order at rung ${ladder[i].rung} (${ladder[i].id})`);
    }
  }

  // 4 — no bare letter/digit may survive an open overlay dialog. Only `viewport` is dropped
  // when a dialog opens, so anything else must carry its own `when` gate.
  for (const binding of bindings) {
    const bare = (chordsOf.get(binding) ?? []).filter(isBareLetterOrDigit);
    if (bare.length === 0) continue;
    if (binding.scope === 'viewport' || binding.when) continue;
    problems.push(
      `${binding.id}: bare key(s) [${bare.join(', ')}] at scope '${binding.scope}' would still` +
        ` fire behind an open dialog — scope it 'viewport' or add a \`when\` that reads $dialogOpen`,
    );
  }

  // 5 — key conflicts inside one reachable scope set.
  const reported = new Set<string>();
  for (const scopes of reachableScopeSets()) {
    const live = bindings.filter((b) => scopes.has(b.scope));
    const byChord = new Map<string, HotkeyBinding[]>();
    for (const binding of live) {
      for (const chord of chordsOf.get(binding) ?? []) {
        const group = byChord.get(chord);
        if (group) group.push(binding);
        else byChord.set(chord, [binding]);
      }
    }
    for (const [chord, group] of byChord) {
      if (group.length < 2) continue;
      // Precedence resolves different ranks; only a tie is a real conflict.
      const top = Math.max(...group.map((b) => scopeRank(b.scope)));
      const tied = group.filter((b) => scopeRank(b.scope) === top);
      if (tied.length < 2) continue;
      // A pair that names each other in `overrides` is a documented, deliberate shadow.
      const undeclared = tied.some((b) =>
        tied.some((o) => o !== b && !shadows(b, o) && !shadows(o, b)),
      );
      if (!undeclared) continue;
      const ids = tied.map((b) => b.id).sort();
      const key = `${chord}:${ids.join('+')}`;
      if (reported.has(key)) continue;
      reported.add(key);
      problems.push(
        `'${chord}' is claimed by ${tied.map((b) => `${b.id} (${b.scope})`).join(' and ')}` +
          ` in one active scope set — narrow a scope or declare \`overrides\``,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`hotkey registry is invalid:\n  - ${problems.join('\n  - ')}`);
  }
}

function shadows(binding: HotkeyBinding, other: HotkeyBinding): boolean {
  return binding.overrides?.includes(other.id) ?? false;
}
