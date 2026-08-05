/**
 * The status bar's axis tints (design: `plans/flexo_v2/design/design-system-services.md`
 * §1.0 "exported from one place: `src/ui/status/axisColors.ts`").
 *
 * This file is a RE-EXPORT, deliberately: the single source of truth is
 * `src/three/axisColors.ts`, which the 3D `AxisGizmo` reads and whose header explicitly
 * forbids a second copy that would be free to drift. It is dependency-free (no three, no
 * react) precisely so both layers can import it, so the design's "one place" is satisfied
 * by pointing at that one place rather than by copying it.
 *
 * The v1 `TransformHud` carried its OWN `AXIS_COLOR` map of pure `#ff0000`/`#00ff00`/
 * `#0000ff` under a comment claiming it matched the gizmo. It did not — the gizmo has used
 * the brightened `#ff5468`/`#7fd94b`/`#4d9dff` set for a long time. The status chips
 * therefore render the TRUE gizmo hues: an intended visible correction, not a regression.
 */

export { AXIS_COLOR_CSS as AXIS_COLOR, type AxisKey } from '../../three/axisColors';
