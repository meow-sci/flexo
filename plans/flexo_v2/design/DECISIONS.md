# flexo v2 — LOCKED design decisions (user-approved, do not re-litigate)

1. **Five modes**: `Build` (default) / `Animation` / `Data` / `Engine` / `Surface`.
   - Build: place/arrange subparts, colliders, lights, IVA seats, connectors, kittens.
   - Animation: joints, timeline, posing, easing.
   - Data: part + subpart GameData, tanks, feeds, mass, coupling; shows subpart list with data-capable vs non-capable (disabled style).
   - Engine: full engine designer (combustors, nozzles, reactions, plumbing/wiring, live thrust/Isp, validation) — self-sufficient, absorbs ConsumerFeedWiring so finishing an engine never forces leaving the mode.
   - Surface: pick a custom mesh → right sidebar becomes material/glow/UV editor with selected-face highlighting in the viewport.
   - Seat-view preview, measure tool, exhaust placement, and chain sessions are transient tools INSIDE modes, not modes. Colliders/lights/seats/connectors remain placeable entities in Build mode.

2. **Docked layout**: menubar, sidebars, status bar, (anim) timeline are real flex siblings; the canvas gets exactly the remaining space → orbit center == visible center. Delete the pointer-events-none overlay machinery and hard-coded reservations. Canvas resizes on sidebar collapse/resize.

3. **Projects — clean slate, NO preservation**: complete redesign of project storage; DO NOT preserve/adopt data from old (v1) projects; no migration code of any kind (constitution). New end state:
   - Stable project ids; snapshots in IndexedDB; a lightweight metadata index (name, description, savedAt, createdAt, part/subpart counts, thumbnail) powering a rich project-manager overlay.
   - Project export/import MUST support ALL features including custom meshes and textures: export a **`.tar.gz` archive** containing `project.json` plus any binary files needed (textures, imported-model GLBs, etc.). This replaces the JSON-snippet export and removes the hasCustomAssets gate. Share-links may remain for asset-less projects (decide in design; document behavior when assets exist).

4. **Rollout**: complete redesign; plan targets the new end state directly when the plan completes. No parallel v1 shell, no feature flags, no old-data adoption. (Phases should still keep the repo compiling/testing along the way for implementability.)

5. **Animation timeline**: bottom-docked timeline/dopesheet above the status bar, Animation mode only. One row per joint, draggable keyframe diamonds, playhead scrub, transport (play/pause/loop/speed) built in. Right sidebar: clip list + joint tree + easing. Left sidebar: selected joint/keyframe details.

6. **Phone: FULL parity** — every v2 surface gets a phone (<640px) variant: modes as a bottom tab bar, sidebars as bottom sheets, timeline as a fullscreen sheet, status bar condensed. Phone UX remains a feature set, not a fallback. Every area design MUST include its phone variant.

7. **Beyond-parity additions (ALL approved)**:
   - Global command palette (⌘K) searching every menubar action, mode switch, tool; the action-chain builder becomes a command inside it (rebound; discard-confirm added).
   - Marquee box-select in the viewport (respecting hidden/locked layers) + hold-alt-drag duplicate + duplicate-with-offset (copies never invisibly stacked).
   - Snap UI: gizmo snap plumbing ($snap) gets real UI — toggles + step sizes + hold-modifier temporary snap.
   - Camera: F = frame selection, camera snaps orbit the selection centroid (not always origin), explicit reset-camera command, orbit-around-selection.

8. **Animation capabilities (ALL approved)**:
   - Animation-specific pose gizmo: rotate-about-pivot rings sized to the joint, screen-space free-drag translation (multi-axis in one gesture), per-gesture axis locking — replaces reused single-axis TransformControls for posing.
   - Temporary working pivots: throwaway anchor (selection centroid / subpart / clicked surface point) to pose about without changing the joint's real pivot.
   - Motion trajectory visualization: each animated joint's path drawn as a 3D curve with keyframe ticks; scrub highlights position (read-only).
   - Per-channel easing curves: separate easing per channel (position/rotation/scale) per segment; export baker already supports; KSA import fitter extended to fit per-channel.

## Standing constraints (from AGENTS.md constitution + analysis — binding on all designs)

- ALL current features retained (the 12 analysis reports in ../analysis/ are the feature census).
- Layering: `src/ksa/` and `src/state/` never import react (three allowed only in the existing carve-outs); UI on react-aria via `src/ui/kit/` primitives; GridList preferred over ListBox; React Compiler rules (no manual memoization); nanostores single source of truth; on-demand render loop (new chrome must not force continuous rendering).
- ALL numeric fields: useNumberDraft + inputMode="url" (PreciseNumberInput/Vec3Field/NumberField).
- Undo/redo invariant: discrete mutations push internally; streaming push once at interaction start. Document state undo-tracked; view state persisted-not-undoable.
- Persistence via @nanostores/persistent for UI/settings state (persist by default). No data migration ever — schema changes purge, never convert.
- KSA game contract (XML semantics, GLB rules, coordinate mapping via coords.ts only, formatG6) is untouchable business logic; scope/ and docs/ must be updated by the implementation.
- Dark-only theme stays; densify with tokens.
- Connectors/kittens can never be joint members (KSA limitation). Chain palette must stay NON-modal (live seed-nudge re-flow is load-bearing).
- toast() must remain imperatively callable from outside React.
