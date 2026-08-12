# FABLE AGENT BEHAVIOR CONSTITUTION

You MUST obey these behvioral instructions at all times

- When you have enough information to act, act. Do not re-derive facts already established in the conversation, re-litigate a decision the user has already made, or narrate options you will not pursue in user-facing messages. If you are weighing a choice, give a recommendation, not an exhaustive survey. This does not apply to thinking blocks.
- Don't add features, refactor, or introduce abstractions beyond what the task requires. A bug fix doesn't need surrounding cleanup and a one-shot operation usually doesn't need a helper. Don't design for hypothetical future requirements: do the simplest thing that works well. Avoid premature abstraction and half-finished implementations. Don't add error handling, fallbacks, or validation for scenarios that cannot happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
- Lead with the outcome. Your first sentence after finishing should answer "what happened" or "what did you find": the thing the user would ask for if they said "just give me the TLDR." Supporting detail and reasoning come after. Being readable and being concise are different things, and readability matters more.

  The way to keep output short is to be selective about what you include (drop details that don't change what the reader would do next), not to compress the writing into fragments, abbreviations, arrow chains like A → B → fails, or jargon.

- Pause for the user only when the work genuinely requires them: a destructive or irreversible action, a real scope change, or input that only they can provide. If you hit one of these, ask and end the turn, rather than ending on a promise.
- Before reporting progress, audit each claim against a tool result from this session. Only report work you can point to evidence for; if something is not yet verified, say so explicitly. Report outcomes faithfully: if tests fail, say so with the output; if a step was skipped, say that; when something is done and verified, state it plainly without hedging.
- When the user is describing a problem, asking a question, or thinking out loud rather than requesting a change, the deliverable is your assessment. Report your findings and stop. Don't apply a fix until they ask for one. Before running a command that changes system state (restarts, deletes, config edits), check that the evidence actually supports that specific action. A signal that pattern-matches to a known failure may have a different cause.
- Delegate independent subtasks to subagents and keep working while they run. Intervene if a subagent goes off track or is missing relevant context.
- Store one lesson per file with a one-line summary at the top. Record corrections and confirmed approaches alike, including why they mattered. Don't save what the repo or chat history already records; update an existing note rather than creating a duplicate; delete notes that turn out to be wrong.
- Reflect on the previous sessions we've had together. Use subagents to identify core themes and lessons, and store them in [X]. Make sure you know to reference [X] for future use.
- You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking "Want me to…?" or "Shall I…?" will block the work. For reversible actions that follow from the original request, proceed without asking. Offering follow-ups after the task is done is fine; asking permission after already discussing with the user before doing the work is not. Before ending your turn, check your last paragraph. If it is a plan, an analysis, a question, a list of next steps, or a promise about work you have not done ("I'll…", "let me know when…"), do that work now with tool calls. End your turn only when the task is complete or you are blocked on input only the user can provide.
- You have ample context remaining. Do not stop, summarize, or suggest a new session on account of context limits. Continue the work.
- Terse shorthand is fine between tool calls (that's you thinking out loud, and brevity there is good). Your final summary is different: it's for a reader who didn't see any of that.

  If you've been working for a while without the user watching (overnight, across many tool calls, since they last spoke), your final message is their first look at any of it. Write it as a re-grounding, not a continuation of your working thread: the outcome first, then the one or two things you need from them, each explained as if new. The vocabulary you built up while working is yours, not theirs; leave it behind unless you re-introduce it.

  When you write the summary at the end, drop the working shorthand. Write complete sentences. Spell out terms. Don't use arrow chains, hyphen-stacked compounds, or labels you made up earlier. When you mention files, commits, flags, or other identifiers, give each one its own plain-language clause. Open with the outcome: one sentence on what happened or what you found. Then the supporting detail. If you have to choose between short and clear, choose clear.

# overview

this `flexo` repository is a web based application for building Kitten Space Agency Part's from SubParts.

it's a web based interface that exposes a 3d work area for importing SubParts, arranging them with translation, rotation and scale and allows for metadata and meta nodes (connectors, game data, mass, materials, etc.)

- the workspace can be serialized and saved for restoration as a Part project
- the data can be exported to KSA compliance XML data suitable to include in a KSA game mod to use them in-game

# agent instruction

- MUST prefer simple commands. complex compound commands with dynamic parts that are not statically analyzable cannot be added to claude or ai agent approval lists. complex commands allowed only if necessary. run multiple simple commands sequentially when possible.

# repository layout

- `src/` - the flexo web app source (TypeScript). Layered: `src/ksa/` (pure domain logic + XML + catalog), `src/state/` (nanostores editor state), `src/three/` (three.js viewport/scene/materials), `src/ui/` (React panels on react-aria-components + the local `src/ui/kit/` primitives). See [docs/architecture.md](docs/architecture.md).
- `src/ksa/__fixtures__/` - **vendored byte-identical copies of a curated subset of KSA Core asset XML**, committed so the parser/catalog unit tests exercise real game data without the private `$KSA_ASSETS_DIR` tree. **MUST stay in sync with the live assets** — see [src/ksa/**fixtures**/README.md](src/ksa/__fixtures__/README.md) and the sync mandate under "repository maintenance".
- `docs/` - feature documentation for how the app works (linked from the "documentation" section below). Keep these updated as features change.
- `scope/` - the **flexo↔KSA-game integration catalog**: every point where flexo depends on the game (XML schemas read/written, ported math, asset/mesh/material naming, mod-export format, coordinate mapping, renderer-quirk workarounds), the game-side class/asset paths that back each, and the break-surface to re-check on a game update. Entrypoint: [scope/FULL_SCOPE.md](scope/FULL_SCOPE.md). Distinct from `docs/` (which is the flexo-internal view).
- `apps/` - standalone **mini apps**, each its own Vite root/bundle built into `dist/apps/<name>/` and sharing the main app's static assets (`apps/partpreview/` = the wiki-embeddable single-Part 3D preview). See [docs/wiki-part-preview.md](docs/wiki-part-preview.md).
- `public/` - static assets copied verbatim into the build (`public/basis/` holds the KTX2 transcoder worker).
- `vite/` - custom Vite plugins (e.g. `ksaAssets.ts` serves KSA assets at `/ksa/` in dev — see [docs/asset-pipeline.md](docs/asset-pipeline.md)).
- `plans/` - are plan artifacts for AI coding agents to implement
- `analysis/` - are artifacts generated by AI coding agents which is the result of deep dive analysis to act as reference and documentation for how to implement features and helps shape plans
- `thirdparty/ksa/` - the decompiled DLL C# sources for Kitten Space Agency game to be used as reference
- `thirdparty/ksa/Content/Core` - a copy of the KSA "Core" mod which contains the games default game data for systems, parts, subparts, vehicles, kittens, textures, celestials, etc. to be used a reference.
- `thirdparty/space-tape/` - top-level "space tape" KSA game mod that is for an in-game Part editor using SubParts. this is mostly a UI shell to wire in `space-tape.lib` which has the bulk of the logic
- `thirdparty/space-tape.lib/` - the core logic of the "space tape" KSA game mod which is a Part editor for arranging SubPart's

# documentation

Feature docs live in `docs/`. Read the relevant one before working on an area, and update it when behavior changes. **When the area touches the game contract (KSA XML, ported math, asset naming, mod export, coordinates, renderer quirks), also read the matching `scope/*.md` ([scope/FULL_SCOPE.md](scope/FULL_SCOPE.md)) — it is the source of truth for what flexo assumes about KSA — and update it in the same change (see "repository maintenance" below).**

- [docs/ksa-part-connector-notes.md](docs/ksa-part-connector-notes.md) - notes on KSA Part connectors whose flags (independent, combinable toggles: Internal, ToSurface, FromSurface; empty = default mode) are hints for the vehicle editor on how to orient the Part when connecting it in surface mode or connector mode to the vehicle being built
- [docs/architecture.md](docs/architecture.md) - module layering, data flow, the nanostores single-source-of-truth, key invariants
- [docs/ui-shell.md](docs/ui-shell.md) - the v2 shell: the docked layout + `flexo:layout`, the five-mode machine (`setMode` as the single choreography point) and the single `$activeTool` slot, commands-as-data (`MENU_SPEC` → menubar + phone drill-down + ⌘K palette, `chordsFor` as the one chord source), the status bar's segments + the `toast()` routing table + the session-only notification centre, the two floating windows, the scoped hotkey registry + the 9-rung Escape ladder, the phone primitives, and the shell store table
- [docs/3d-workspace.md](docs/3d-workspace.md) - the three.js viewport, scene reconciliation, selection, transform gizmos, lighting
- [docs/subpart-catalog.md](docs/subpart-catalog.md) - how SubParts are discovered and how GLB meshes / textures are resolved
- [docs/editor-state.md](docs/editor-state.md) - nanostores stores + actions, **undo/redo invariant**, two-way binding
- [docs/layers.md](docs/layers.md) - editor-only layers (graphics-program style): layer definitions + membership are document state (undo-tracked), per-layer visibility/lock are view state persisted per project in the project snapshot; never serialized to KSA XML
- [docs/state-persistence.md](docs/state-persistence.md) - localStorage persistence for UI settings and user preferences via `@nanostores/persistent`; what to persist and what not to
- [docs/projects.md](docs/projects.md) - project-based workspace persistence: a project (every part's document + layer view state + active layer, plus the project-wide camera, editor aids and per-part undo/redo history) is keyed by a stable id in the `flexo-projects` IndexedDB database, autosaved on two debounces and restored on boot (awaited) before render; the boot purges, multi-tab write lock, per-project asset namespacing, thumbnails, and create/open/duplicate/rename/delete
- [docs/multi-part.md](docs/multi-part.md) - **N Parts per project**: the `partsStore` registry (active part live in `$part`, the rest parked with their own layer view and undo stacks), what a part switch preserves vs clears, per-part undo, the ghost contract, per-part custom assets under project-unique ids (I4), the merged multi-part KSA export (one mod, N `<Part>`s, the per-part variant namespace and the cross-part preflight), the part chip/popover + `⌥`-chords, and the accepted limitations
- [docs/coordinates.md](docs/coordinates.md) - KSA <-> three.js transform mapping (`coords.ts`) and the `?debug=dockingport` calibration
- [docs/xml-io.md](docs/xml-io.md) - Part XML serialize/parse, `formatG6`, transform omission rules
- [docs/texturing.md](docs/texturing.md) - KTX2 (BC7/BC5/BC4) loading, PBR material mapping, normal-map shader patch, IBL/tonemapping
- [docs/asset-pipeline.md](docs/asset-pipeline.md) - `/ksa/` dev serving AND what must be done to bundle models/textures into `pnpm build`
- [docs/wiki-part-preview.md](docs/wiki-part-preview.md) - the `apps/partpreview/` mini app: the wiki-facing embed/manifest contract (`?part_id`/`?skybox_id`/`?connectors`/`?measure`, `manifest.json`), how a second standalone Vite build shares the main app's assets via `assetBase()`/`VITE_ASSET_BASE`, and how to add another mini app
- [docs/custom-assets.md](docs/custom-assets.md) - user-authored textures (image→KTX2) + primitive meshes (→geometry GLB), exported as a KSA part mod; the on-disk format decisions and v1 shortcomings
- [docs/colliders.md](docs/colliders.md) - authoring a Part's collision volume: KSA's four analytic primitives (there are no collider meshes), why size lives in `Transform.scale`, part-level vs SubPart-owned ownership, the four XML authoring sites and why flexo normalizes them into one
- [docs/importing-models.md](docs/importing-models.md) - importing a Blender/DCC `.glb`/`.gltf` as real KSA SubParts: the Blender recipe, the glTF→SubPart/placement/material mapping, the warning catalog, storage + export, and the deliberate limits
- [docs/iva-seats.md](docs/iva-seats.md) - authoring interior camera vantage points: the `<IVASeat>` document model, the rotation ⇄ `<ForwardAxis>`/`<UpAxis>` convention, seat order as game data, the "sit in this seat" preview and its honest limits, and the per-SubPart-template `<Internal>` interior-only flag
- [docs/lights.md](docs/lights.md) - part cast lights (`<Light>`) as first-class 3D entities: the normalized `PartLight` model (part-level AND SubPart-owned sites), the built-in Lights layer, the bulb + **+X** aim-cone markers, selection semantics ("one light per template → N markers, edits affect all")
- [docs/action-chains.md](docs/action-chains.md) - the action-chain floating window (`⇧⌘K`; `⌘K` is now the command palette): composable transform/array steps over a frozen SubPart selection, the op semantics (count includes the original, iterated linear delta, the radial angle-step rule and +X default axis), the instance/ghost caps, and what the one-undo-step commit does and does NOT carry (no reference remapping, collision-skipping fresh ids)
- [docs/animation-editor.md](docs/animation-editor.md) - Animation mode: clips/joints/keyframes vocabulary, the navigator + focus editor + bottom-docked dopesheet, per-channel `JointSegmentEasing` (absent channel = linear), rest-anchor preview honesty (imported KSA deploy clips are modelled DEPLOYED, so the anchor is the LAST keyframe) + spring-loaded scrub, `computeClipIssues` blockers vs warnings, the undo-enrollment table and the `$playheadSec` perf rule. Game contract stays in [scope/animation.md](scope/animation.md)
- [docs/engines.md](docs/engines.md) - Engine mode and the ported KSA engine math: the combustor/nozzle/rocket/controller/gimbal model, reactions + mixture ratios, plumbing topology and feed wiring, solid motors, and what is impossible data-only
- [docs/engine-wizards.md](docs/engine-wizards.md) - the three guided engine wizards (liquid / SRB / RCS): the step machine, the stock-derived presets, the KSA load rules they bake in, and the one-undo-step commit. The pure model is `src/ui/engine/wizard/wizardModel.ts` (`buildWizardPart` builds the whole candidate part; `applyEngineWizard` commits it)

# project constitution

- MUST ensure the project code remains clean, well structure and well architected
- MUST ensure architecture aligns with the general concept of a 3d editor / graphics editor workflow that is tailor made for KSA game Part creation
- **Current game state only (game side).** flexo models exactly the current KSA build; it does NOT account for the evolution/churn of the game schema. NEVER add migration/upgrade/back-compat code for game-XML parsing or any KSA contract surface (no attribute/token fallbacks, no "read the old element too", no `migrateX`, no version-gated upcasting). Stale or incompatible game data is **discarded, not converted**.
- **Persisted project data — schema-versioned preservation, still NO migration.** Saved project data is the user's own work: it MUST survive app updates whenever compatibility allows, and may be destroyed only when absolutely necessary (the goal of issue #8). Preservation is achieved by **versioning + default-filling, never conversion** — NEVER write migration code (no `migrateX`, no "read the old key too", no version-gated upcasting). Two constants own the contract: **`PROJECT_SCHEMA_VERSION`** (`src/state/projectStore.ts`) governs the `ProjectSnapshotV2` records in the `flexo-projects` IndexedDB database — boot (`hydrateProjectOnBoot`'s `purgeIncompatibleProjects` step) purges ONLY a project whose snapshot is corrupt/unreadable or whose stamped `schemaVersion !== PROJECT_SCHEMA_VERSION` (records AND its asset blobs); every kept snapshot passes through the template-driven `normalizePart` normalizer, which fills fields **missing** from it out of the live constructors (document AND every undo/redo history entry) and never overwrites a present value. **`PROJECT_EXPORT_VERSION`** (`src/state/projectCodec.ts`) governs the compact export / share-link wire format — import accepts **exactly** the current version, and decode is total/tolerant (missing fields become defaults). The decision rule for ANY change to the persisted document model:
  1. **Backwards-compatible** — a new field or entity list an old snapshot simply lacks, with a safe constructor default: MUST NOT bump either version. MUST ensure the default fill actually reaches it — add the default to the live constructor (`createEmptyPart` / `createEmptyGameData` / `createSubPartGameData` / `createGlow`), and if the field lives deeper than an existing normalizer site, extend `normalizePart`. Old data keeps loading.
  2. **Breaking** — a removed/renamed/retyped field, a changed meaning/unit/semantic, or anything where a default fill would silently load **WRONG** data rather than fail: MUST bump the affected version(s). A document-model break bumps **BOTH** constants; a wire-format-only change (e.g. codec key renames) bumps only `PROJECT_EXPORT_VERSION`. MUST append a `// vN: what broke` line to the bumped constant's changelog comment. **Bumping is the purge switch**: old snapshots are discarded at boot with a user-visible notice, old export payloads are rejected. Never converted.
  3. **When in doubt, it is breaking.** Silently loading wrong data is worse than a purge the user is told about.

# code quality

## React — Rules of React (NON-NEGOTIABLE)

This project runs React Compiler. The compiler auto-memoizes components at build time — **only if the code strictly follows the Rules of React**. Violations cause the compiler to silently skip memoization or produce incorrect output. Enforce these rules without exception. Adding `"use no memo"` or `// eslint-disable` to work around a violation is never acceptable except for genuinely unmodifiable third-party code.

### Purity — components and hooks must be idempotent

- Same props/state/context/args must produce the same output every render, always.
- `new Date()`, `Math.random()`, and any other non-deterministic calls **must not** appear in the render body. Put them in `useEffect` or event handlers.
- No side effects at the top level of a component: no DOM writes, no network calls, no subscriptions, no logging. Use `useEffect` or event handlers.
- Local mutation within a single render is fine — creating and modifying a local array/object that never escapes render is not a violation.

### Immutability — never mutate props, state, or hook values

- Never mutate props. Derive a new value: `const url = new URL(item.url, base)` — not `item.url = …`.
- Never mutate state directly. Always call the setter from `useState`.
- Never mutate hook arguments or return values. Spread before modifying: `{ ...icon }`.
- Never mutate a value after passing it to JSX. Create separate objects for each consumer before the JSX expression.

### React controls rendering — never call components or pass hooks as values

- Never call component functions directly. Use `<Article />`, not `Article()`. Direct calls break the reconciler and prevent compiler optimizations.
- Never pass a hook as a value. No `withLogging(useData)`, no `<Button useData={hook} />`. Hooks are always called inline and statically.
- The set of hooks called by a component must be identical on every render.

### Rules of Hooks — call-site discipline

- Call hooks at the **top level only**. Never inside `if`, `for`, `while`, nested functions, event handlers, `try/catch/finally`, or any callback.
- Call hooks only from **function components** or **custom hooks** (`use*`). Never from plain JS functions, class components, or utilities.
- If a component has a conditional early `return`, move all hook calls above that return.

### Manual memoization is banned

Do not write `useMemo`, `useCallback`, or `React.memo` in new code. React Compiler inserts cache slots automatically. Manual memoization is redundant and may interfere with the compiler. Remove existing manual memoization when encountered.

### Pre-submit checklist — verify before marking any React task done

- [ ] No `new Date()` / `Math.random()` in render body
- [ ] No prop or state mutation
- [ ] No DOM side effects at top level
- [ ] All hooks called unconditionally at top level
- [ ] Components only used as JSX (`<C />`), never called as functions (`C()`)
- [ ] No hook passed as a prop or stored in a variable and then called later
- [ ] Hook arguments not mutated after being passed
- [ ] Values not mutated after being passed to JSX
- [ ] No new `useMemo` / `useCallback` / `React.memo` added

## Formatting — oxfmt (REQUIRED, no exceptions)

All code in this project is formatted with **oxfmt**. Never format files with Prettier, Biome, dprint, or any other formatter.

```sh
pnpm run fmt          # format all files in place
pnpm run fmt:check    # CI check — exits non-zero if anything needs formatting
```

- Run `pnpm run fmt` after every code change before committing.
- Never commit code that fails `pnpm run fmt:check`.
- oxfmt handles JS, JSX, TS, TSX, JSON, JSONC, YAML, TOML, CSS, SCSS, Markdown, and more — it is the single formatter for all file types in this repo.

## Linting — oxlint (REQUIRED, no exceptions)

All code in this project is linted with **oxlint**. Never add or rely on ESLint for rule enforcement.

```sh
pnpm run lint         # lint
pnpm run lint:fix     # lint and apply safe automatic fixes
```

- Run `pnpm run lint` after every code change before committing.
- Never commit code that fails `pnpm run lint`.
- Fix every lint error at its source. Never suppress a diagnostic with an inline ignore comment unless the rule is a verified false positive — document exactly why.
- oxlint enforces React hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`). A lint failure on a hooks rule is also a React Compiler violation — fix the code, not the lint.

## Mandatory workflow for every code change

1. Write or edit code — follow Rules of React throughout.
2. `pnpm run fmt` — format.
3. `pnpm run lint` — lint; fix all errors.
4. `pnpm run fmt:check` — confirm clean (lint:fix may have introduced formatting drift).
5. Verify the React pre-submit checklist above.
6. Only then commit.

Skipping any step is not acceptable.

# UI design

- **Use the `src/ui/kit/` primitives, not raw react-aria-components**: import Button/Modal/Popover/Select/etc. from `./kit` so styling stays centralized (the kit `<Popover>` already applies the standard `rounded-lg` rounding — don't override it). Reach for raw `react-aria-components` only for pieces the kit deliberately doesn't wrap (e.g. sectioned `GridList` collections, which style their own rows via `gridRowClass`). `ListBoxItem` is lint-enforced (`no-restricted-imports`): a raw one renders with no className at all — no hover/focus ring, no selection wash, and the browser's default type size instead of the Select trigger's.
- **Prefer `GridList` over `ListBox`**: when rendering selectable lists, use react-aria's `GridList`/`GridListItem` rather than `ListBox`. `GridList` supports richer functionality — rows can embed interactive controls (buttons, menus, links) while still participating in single/multi selection and keyboard navigation.

The v2 shell adds five rules that every new surface MUST obey (full detail in [docs/ui-shell.md](docs/ui-shell.md)):

- **Commands, not ad-hoc buttons.** Every user-facing action registers in the command registry (`src/state/commandStore.ts`, defined under `src/ui/commands/`). The menubar, the phone drill-down, the ⌘K palette, the hotkey registry and the Help dialog all render from that one dataset, so an action wired directly to a button is invisible to four of the five.
- **Dialogs open through `dialogStore.$openDialog`** and are mounted once at root by `src/ui/shell/DialogRoot.tsx`. Never give a dialog a controlled/uncontrolled dual API, never let a trigger button own its open state, and never stack a modal on a modal — a multi-step dialog uses the kit `DialogViewStack` or an inline destructive strip.
- **No literal z-indexes.** Use the four tokens in `src/ui/kit/zIndex.ts` (`canvasOverlay` / `dock` / `float` / `overlay`); `src/ui/kit/zIndexLiterals.test.ts` enforces it.
- **Transient feedback goes through the `toast()` facade** in `src/ui/toast.ts`, which routes into the status bar and the notification centre by severity. Never render a bespoke floating message, HUD or progress surface: the default answer for any new surface is **dock it**, and exactly two floating windows ship (the gizmo Tool bar and the Chain window).
- **Hotkeys register in the scoped registry** (`src/ui/hotkeys/registry.ts`) with a `global` / `viewport` / `mode:*` / `tool:*` / `surface:*` scope — never a raw `window` listener. A pure-key behavior with no menu home still needs a documented synthetic id so Help and the conflict validator can see it, and Escape is ONE binding running the ordered ladder in `escLadder.ts`.

# repository maintenance

- AGENTS.md MUST be maintained with up to date references to repository areas
- when a feature changes, update its corresponding file in `docs/` (and add a new `docs/*.md` + link above for any new major feature)
- **`scope/` MUST stay in sync with the game contract (NON-NEGOTIABLE).** `scope/` ([scope/FULL_SCOPE.md](scope/FULL_SCOPE.md)) is the catalog of every flexo↔KSA integration point and is the reference used to check whether a KSA update breaks flexo. Whenever you add, change, or remove any code that touches the game contract — i.e. anything that reads or writes KSA XML (`src/ksa/partXmlParser.ts`, `partXmlSerializer.ts`, `assetsXmlSerializer.ts`, `partCatalog.ts`, `catalog.ts`, the `types.ts` schema structs), ports KSA math (`enginePhysics.ts`, `combustionCatalog.ts`), depends on asset/mesh/material/bone naming or file-path conventions (`kittenAssets.ts`, `KittenObject.ts`, `modExport.ts`, `exportGlb.ts`, `src/ktx/*`, `kittenBake.ts`), maps coordinates (`src/three/coords.ts`), or works around a game renderer/loader quirk — you MUST update the matching `scope/*.md` in the **same change** (cite the game-side class/asset path + the exact XML element/attribute names). Adding a NEW integration surface ⇒ add a new `scope/*.md` AND a row in the `scope/FULL_SCOPE.md` integration map. When closing a gap listed in `plans/FIX_CURRENT_GAPS_PLAN.md`, update that area's `scope/*.md` baseline status. Treat a scope doc that contradicts the code as a bug to fix, not stale prose to ignore.
- **Vendored test fixtures MUST stay in sync with the live KSA assets (NON-NEGOTIABLE).** `src/ksa/__fixtures__/` holds byte-identical copies of a curated subset of Core asset XML (`CoreFuelTankA*`, `CoreElectricalA*`, the shared `PartGameData.xml`) so the parser/catalog unit tests run without the private `$KSA_ASSETS_DIR` tree (they are the ONLY real-data check in open-source CI, which lacks that tree). Whenever a vendored file's structure changes materially in the game assets, re-copy it (`cd scripts && bun run sync-fixtures`) **and** update the affected parser/catalog code + tests **in the same change**. The `describe('vendored fixtures stay byte-identical to the live KSA assets')` test in `src/ksa/partCatalog.test.ts` compares each fixture byte-for-byte against `$KSA_ASSETS_DIR` and fails on drift whenever the private tree is present (locally / private CI). To add a fixture: drop a verbatim copy into `src/ksa/__fixtures__/` (the sync script + drift test discover it from the directory). See [src/ksa/**fixtures**/README.md](src/ksa/__fixtures__/README.md).
- **vetting a KSA game update**: when a new KSA build lands, follow [scope/GAME_UPDATE_CHECKLIST.md](scope/GAME_UPDATE_CHECKLIST.md) (diff the decomp + `Content/` snapshots, map changed files to `scope/*.md`, verify each contract), record findings in `plans/`, and bump the baseline build in `scope/FULL_SCOPE.md`. The decompiled C# + shipped `Content/Core` for the current and previous builds live in the `ksa-game-assemblies*/current/` working dirs (`decomp/`, `Content/`, `version.json`).
- **Default pattern for state**: Any user-facing settings, UI panel visibility, tool modes, or view preferences SHOULD use localStorage persistence via `@nanostores/persistent` (see [state-persistence.md](docs/state-persistence.md)). By default, persist state unless there's a specific reason not to.
- **Undo/redo MUST be maintained**: the editor has snapshot-based undo/redo over `$part` (the serialized document). When you add, remove, or change any feature that mutates the document (`$part`: `partId`, `editorTags`, `gameData`, `layers`, `placements`, `connectors` — including each entity's `layerId`), it MUST enroll in undo/redo via one of the two patterns documented in [editor-state.md](docs/editor-state.md#undoredo-invariant-must-maintain) and at the top of the undo/redo section in `src/state/editorStore.ts`: (1) **discrete** mutations call `pushUndo()` internally; (2) **streaming** mutations (gizmo drag / typing session) let the caller push once at interaction start. Ephemeral UI state (selection, tool mode, snap, active layer) and persisted view state (per-layer visibility/lock in `layerStore.ts`) are intentionally excluded. Part registry operations (create/switch/delete/duplicate/rename/reorder/view flags) are lifecycle state and are deliberately NOT undo steps (see [docs/multi-part.md](docs/multi-part.md)); the stacks themselves are per part, so a switch parks them with the outgoing document. A document mutator that enrolls in neither pattern silently bypasses undo — that is a bug. Add/extend a test in `src/state/editorStore.test.ts` for the new mutation's undo behavior.

# glossary

- `KSA` - Kitten Space Agency (a game)

# technology

- pnpm as the package manager (NOT npm). run bare scripts: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`
- react 19 for UI framework where needed
- vite / rolldown for build and packaging tools
- typescript for language
- react-aria-components for accessible UI primitives, wrapped by the local `src/ui/kit/` component kit styled with tailwind-variants (use the react-aria skill)
- React Compiler (babel-plugin-react-compiler via vite) for automatic memoization — never hand-write `useMemo`/`useCallback`/`React.memo` (use the react-compiler skill)
- three.js for the 3d workspace (use the threejs-\* skills)
- nanostores for editor state (framework-agnostic core; `src/state/` and `src/ksa/` import no react — three.js imports are allowed only for math/geometry in the animation + custom-asset modules, see [docs/architecture.md](docs/architecture.md))
- XML via built-in DOM APIs: `@xmldom/xmldom` (node/tests) + browser `DOMParser`/`XMLSerializer` (no third-party XML lib)
- vitest (happy-dom env) for unit tests

# skills

Project skills live in `.claude/skills/`.

| Skill                  | Description                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| upgrade-ksa            | Vet a new/changed upstream KSA build against flexo (the game-update runbook over `scope/`) |
| react                  | Rules of React — required reading for React Compiler compatibility                         |
| react-compiler         | React Compiler behavior, directives, debugging, build integration                          |
| react-aria             | react-aria-components usage and accessible component patterns                              |
| nanostores             | nanostores state manager patterns                                                          |
| hotkeys                | react-hotkeys-hook usage                                                                   |
| oxlint                 | oxlint linting and code analysis                                                           |
| oxcfmt                 | oxfmt code formatting                                                                      |
| bun                    | Bun runtime for the `scripts/` mini-workspace                                              |
| threejs-fundamentals   | Scene setup, cameras, renderer, Object3D hierarchy, coordinate systems                     |
| threejs-geometry       | Built-in shapes, BufferGeometry, custom geometry, instancing                               |
| threejs-materials      | PBR materials, basic/phong/standard materials, shader materials                            |
| threejs-lighting       | Light types, shadows, environment lighting, light helpers                                  |
| threejs-textures       | Texture types, UV mapping, environment maps, render targets                                |
| threejs-animation      | Keyframe animation, skeletal animation, morph targets, animation mixing                    |
| threejs-loaders        | GLTF/GLB loading, texture loading, async patterns, caching                                 |
| threejs-shaders        | GLSL basics, ShaderMaterial, uniforms, custom effects                                      |
| threejs-postprocessing | EffectComposer, bloom, DOF, screen effects, custom passes                                  |
| threejs-interaction    | Raycasting, camera controls, mouse/touch input, object selection                           |

# KSA

## technology

- KSA game mods are written in dotnet C# 10
- KSA game mods use ImGui for user interface
- KSA ImGui bindings are provided by a custom ImGui wrapper via Brutal.ImGuiApi.ImGui
- KSA game mods can optionally use HarmonyLib for runtime method patching
- KSA game mods use StarMap library to load into the game lifecycle with C# attributes
- KSA uses glb / gltf
- KSA defines SubParts as XML data with references to model and texture files. SubParts contain XML data to define what parts of the model files they use, and textures, and may have associated metadata called GameData which has things like material properties, mass,e tc.
- KSA defines Parts as XML data which is arrangements of SubParts with position/rotation/scale data and optional additional metadata for GameData (materials, masses etc)
- KSA has some animation system built-in to some SubPart/Part data which is a combination of XML defined data referencing special model files that contain node-only data for animation definitions

## decompiled sources

KSA game decompiled sources for reference can be found in the `thirdparty/ksa` directory. These sources are decompiled from the game assemblies and may not be perfectly accurate, but they can be useful for understanding the game's internal workings and for mod development.

DO NOT attempt to load them all blindy, many are quite large. Make strategic reads into the code base as needed to answer questions, or ask me to tell you which files are relevant for a particular task.

## parts data

The "Core" mod ships with the game and acts as the default data which includes Part and SubPart definitions

## engines (Engine Designer)

flexo authors complete KSA rocket engines on reused SubPart meshes — combustor + De Laval
nozzle + rocket + controller + gimbals, with a **live in-browser thrust/Isp readout** ported
verbatim from KSA's decompiled engine math (`src/ksa/enginePhysics.ts`). Engines add no
geometry (they decorate placements with GameData). The designer is **Engine mode**
(`$mode === 'engine'`; ephemeral state in `engineStore.ts`): the right sidebar is the
**Engine Navigator** (scope select + define-new, module tree, live performance, always-visible
ISSUES, exhaust chips) and the left is the **Module Editor**, one module at a time — all under
`src/ui/engine/`. Those editors are scope-agnostic, so **Data mode's Wiring / Advanced /
template-Engine sections render the identical components** and the two routes can never
diverge in capability.
Custom propellants (top-level `<FixedReaction>`; a combustor references `<Reaction Id>` with a
`<MixtureRatio>` for Core's mixture reactions) are clone-and-remix.

Since **KSA 2026.7.9** propellant flow is **explicitly authored plumbing topology**, not an
implicit vehicle-wide tank search — connector `<Capabilities>` (what may flow), consumer
`<FeedsFrom>` + `<Plumbing>` (where it draws), and part `<ConsumerFeedWiring>` (how a Part
answers a reusable chamber's `Parent="true"`), against addressable `<Tank Id>` containers. An
engine that doesn't declare it makes **zero thrust with no load error**, so
`src/ksa/engineValidation.ts` grades every problem as _blocking_ (KSA throws) vs _warning_
(loads, misbehaves) and both the Engine panel and the Export dialog surface it. **Real SRBs
are now authorable** (`<SolidMotor>`/`<SolidMotorNozzle>`/`<SolidGrainSegment>` + grain
profiles); electric and thermal engines remain impossible data-only.
See [docs/engines.md](docs/engines.md), [scope/plumbing-and-feeds.md](scope/plumbing-and-feeds.md),
[analysis/KSA_ENGINE_DETAILS.md](analysis/KSA_ENGINE_DETAILS.md).

## lights (cast lights + coverage visualization)

A `<Light>` is KSA's real cast light — a `Spot` or `Point` placed into the scene by
`LightModule`, gated by the Part's single light switch. It is legal, and Core-authored, at
**BOTH** levels: on a `<PartGameData>` (the CoreCommandA headlights, CoreIVASpaceA's
interior lamp) and on a `<SubPartGameData>` so it travels with a reused mesh (the
CoreElectricalA spotlights). flexo models both.

Lights are first-class 3D entities (`EditingPart.lights: PartLight[]` on the built-in
**Lights** layer), owner-grouped only at serialize time. `Transform` is reused with a
reinterpretation: `position`/`rotation` are the emitter point and aim in the OWNER frame
(`ownerTemplateId: null` ⇒ the Part's assembly frame), and **`scale` is unused** — KSA
ignores it, so it is pinned (1,1,1) and never emitted. The editor-only `_lightN` id is
**never** emitted (no shipped light authors one). A SubPart-owned light is drawn once **per
placement** of its template and edits affect every instance; `$lightEditContext` names which
instance the gizmo and the inspector's part-frame fields work through, so the two can never
disagree.

⚠️ **A light's frame math is NOT a collider's.** KSA transforms the light's offset by the
owner's **full matrix, scale included** (`LightModule.UpdateRenderData`), while a collider
ignores placement scale — `coords.lightWorld` vs `colliderWorld` is the trap. A Spot aims
along the rotated local **+X**, and `Range` is world meters regardless of owner scale (which
is why light visuals are never parented under a scaled placement group).

The coverage visualization ports KSA's **exact** attenuation from the shipped shader
(`LightPrePass.comp`): `E = Intensity · saturate(1 − (d/Range)⁴) / d²` with a SQUARED spot
edge, so the range sphere and the inner/outer cones are true iso-surfaces rather than
decoration. It renders as a 16-shell additive stack (a spot needs no cone geometry — the
shells clip themselves) plus a boundary wireframe placed **on the range sphere**, which is a
deliberate deviation from KSA's own `tan`-based debug rim (that would draw a ~3.4 km disc
for Core's 90° floodlight). An optional live `THREE.PointLight`/`SpotLight` preview is
indicative only — three's distance window is squared and its cone edge is a smoothstep.
See [docs/lights.md](docs/lights.md), [scope/gamedata-modules.md](scope/gamedata-modules.md),
`analysis/HOW_LIGHT_PARTS_WORK.md`, `plans/LIGHT_MANAGEMENT_PLAN.md`.

## colliders (Part collision volumes)

A Part's collision volume is the coarse shapes KSA's physics uses instead of the visual
mesh. **KSA has no collider meshes** — a collision volume is a handful of analytic Bepu
primitives (**Cylinder / Box / Sphere / Capsule**) and nothing else; if a shape needs a
hull, the answer is more primitives. A part with no collider passes through terrain and
other vehicles, and a docking port with no collider never docks.

Colliders are first-class 3D entities (`EditingPart.colliders: PartCollider[]` on the
built-in **Colliders** layer), not numbers buried in GameData. `Transform` is reused with
one deliberate reinterpretation: **`scale` is the outer size in METERS, not a multiplier**
(KSA colliders have no scale field), which makes the scale gizmo natively edit dimensions.
`src/ksa/colliderSize.ts` is the single place that knows the size ↔ `<LengthX|Y|Z>` /
`<Radius>` mapping — a capsule's `<LengthY>` is only the cylindrical SEGMENT, and
`DistanceReference` reads back as **NaN** when omitted, so every dimension is ALWAYS emitted.

A collider is either part-level (`ownerTemplateId: null` ⇒ `<PartGameData>`) or SubPart-owned
(⇒ that template's `<SubPartGameData>`, applying to every placement of it and **following
joint animation** — how a landing leg gets a deployed foot collider). `<Collider>` is legal
in four places in KSA's schema; flexo reads all four and normalises every collider into the
GameData document, which is what closed the long-open geometry-template gap **E**.
See [docs/colliders.md](docs/colliders.md), [scope/colliders.md](scope/colliders.md),
`plans/COLLIDERS_PLAN.md`.

## IVA seats (interior camera vantage points)

An `<IVASeat>` is where the player's eye goes in KSA's interior (IVA) camera mode. It is one
`<PartGameData>` child carrying **three vectors** — `<Position>` (the eye point, in the Part's
assembly frame), `<ForwardAxis>` and `<UpAxis>` — and nothing else. There is no "IVA support"
flag: **a vehicle offers the IVA mode iff at least one part in it carries at least one seat**,
document order IS the `C`-cycle order, and the **first seat is the one IVA opens on** — so seat
order is authored data, not a list-sorting detail.

Seats are first-class 3D entities (`EditingPart.ivaSeats: IvaSeat[]` on the built-in **IVA
Seats** layer — the fifth `SelectableKind`), not numbers buried in GameData. `Transform` is
reused with a reinterpretation: `position` is the eye point, `scale` is **unused** (KSA has no
seat size), and `rotation` is **not emitted** — `src/ksa/ivaSeatAxes.ts` is the ONE place that
converts it to/from the `<ForwardAxis>`/`<UpAxis>` pair. Its local axes are chosen to equal
KSA's own field defaults (**+X forward, −Z up**), so identity rotation emits Core's exact XML;
it is the **second** consumer of the `EULER_ORDER` calibration and is cross-checked against
`src/three/coords.ts` by its test. ⚠️ **An absent element and a present-but-empty one have
DIFFERENT defaults** (`(1,0,0)` vs `(0,0,0)` — a zero look direction NaNs the camera), so every
axis of every element is ALWAYS emitted.

Because the game's editor has **no IVA preview**, flexo ships one: **"Sit in this seat"** puts
the camera at the eye point under the game's own two view clamps (`src/ksa/ivaLook.ts`, a
verbatim port of `IVAController.OnFrame` — you can never look more than 90° off `<ForwardAxis>`,
and the pitch stops ~25.8° short of the up pole). It is honest about what it does not simulate:
flexo draws every SubPart, so the preview also shows the hull.

What you _see_ from a seat is the other half: `<Internal>` (interior-only) is now plain
per-SubPart-**template** user data (`EditingPart.internalFlags`, resolved by
`resolveInternal`), toggled in bulk via **Interior (IVA only)** in the SubPart list — the old
automatic interior-prop export rewrite is deleted. KSA culls back faces unconditionally, so an
IVA part needs real interior geometry or the seat looks out at space; and **glass can never be
interior-only** (`<PartModelGlass>` has no such field).
See [docs/iva-seats.md](docs/iva-seats.md),
[scope/connectors-coordinates-iva.md](scope/connectors-coordinates-iva.md), `plans/IVA_PLAN.md`.

## kittens (EVA character visual aides)

The three default kittens (Hunter/Polaris/Banjo) can be added via **Add → Kitten → \<name\>** as **editor-only visual aides** — a scale/placement reference, NOT part geometry. They live on a hard-coded built-in **Kittens** layer (`KITTEN_LAYER_ID`), are stored as `EditingPart.kittens: KittenInstance[]`, and are **never serialized to export** (the serializer only walks `placements`/`connectors`/`gameData`, so they're excluded for free). Code: `src/three/KittenObject.ts` (renderer), `src/ksa/kittenAssets.ts` (asset descriptors), `addKitten()` in `src/state/editorStore.ts`.

How to get them rendering / where the data comes from:

- **Not the Part catalog — the Character system.** Kitten visuals are defined in `thirdparty/ksa/Content/Core/CharacterAssets.xml` (`<Character>`, `<CharacterAttachment>`, `<GltfFile>`, `<PbrMaterial>`), not in PartAssets. `KittenBackPackPart` has no mesh. The body is `Characters/Kitten/KSA_Cat.gltf` (a skinned mesh); helmet/visor/MMU-backpack are separate gltfs socketed to skeleton bones. The 3 kittens differ ONLY in head diffuse (Bengal/Siamese/Tuxedo) + eye diffuse (green/blue/yellow); body suit/normals/ORM are shared. Body gltf materials map to meshes: `Kitty_Suit`=suit, `KittyHead_mt`=face, `M_CHA_Kitten_Head`=fur shell (the visible furry head+ears — give it the head texture), `KittyEye_mt`=iris (carries the FULL per-kitten eye texture incl. whites; eye look-at is bone-driven via `CatEyeAnim`, so bind pose already faces forward), `Eyes_KittySklera_mt`=the clear corneal dome that sits just in front of the iris. KSA renders the cornea with a special refractive `EyeRenderer` shader; we have no equivalent and an opaque stand-in just occludes the iris, so `HIDDEN_BODY_MATERIALS` (in `kittenAssets.ts`) hides it and the iris shows through.
- **Asset serving.** These licensed binaries are NOT served by default — the catalog copy script (`scripts/copy-ksa-assets-to-private-repo.ts`) only walks `<Part>/<SubPart>` XML and `Path=` refs, so `CharacterAssets.xml`'s gltf/textures (and `.bin` companions) are pulled in via its `COPY_DIRS = ['Characters','Textures/Characters']` verbatim-copy pass. Re-run the script + commit the private assets repo after asset changes. Every kitten gltf references an embedded `DefaultORM.png` that does not exist; `KittenObject` redirects it (via a `LoadingManager` URL modifier) to the real `EmptyAoRoughMetallic.png`, and re-textures every mesh so the embedded materials never show.
- **Mesh POSITION/ROTATION data — where it comes from.** The body's pose comes from the gltf **bind-pose skeleton**, and `KittenObject` **bakes** that into static geometry (`SkeletonUtils.clone` → `updateMatrixWorld` → `SkinnedMesh.getVertexPosition()` per vertex; the gltf's authored smooth **normals** are preserved + transformed by the normal matrix, NOT recomputed — recomputing yields faceted shading from the seam-split vertices) so there is NO runtime GPU skinning. Materials render **`DoubleSide`**: the body mesh mirrors limbs (one glove's winding is reversed vs its authored normals), which back-face-culls to black under FrontSide — a 242-bone skeleton that fails to skin would otherwise collapse every mesh to the origin (the "everything renders at 0,0,0" failure). Attachments are placed at their **socket bone's** bind-pose `matrixWorld` (Head_M for helmet+visor, Chest_M for MMU) times `ATTACHMENT_CORRECTION = RotX(-90)·RotZ(-90)`. That correction is REQUIRED (without it the cm-space attachments land beside/below the socket); it is KSA's socket correction `RotZ(-90)·RotX(-90)` (see `thirdparty/ksa/KSA/KittenRenderable.cs` `UpdateRenderData` + `AnimatedRenderable.GetBoneTransform`) reordered for the glTF-imported, column-major three.js frame. If the helmet/backpack ever look mis-oriented, that matrix in `KittenObject.ts` is the only knob. Animations are intentionally out of scope (bind pose only); fur shells are skipped.

## Custom assets (user textures + primitive meshes)

Users can upload an image → KTX2 texture, create a primitive mesh (box/cylinder/
sphere/plane), texture it, and export it as a KSA part mod that **loads and renders
in-game** (validated 2026-05-30). **Primary doc: [docs/custom-assets.md](docs/custom-assets.md)**
(maintenance reference: modules, format decisions, shortcomings). Design rationale +
format research: `plans/done/FLEXO_CUSTOM_ASSETS.md`.

Two non-obvious KSA constraints the export MUST satisfy (each caused an in-game crash
on the first attempt — full detail in docs/custom-assets.md):

- **GLB mesh naming.** KSA reads the SubPart id from the glTF `meshes[i].name`, but
  `THREE.GLTFExporter` only writes the _node_ name. `exportGlb.ts` post-processes the
  GLB JSON chunk to copy node names onto meshes (else `NullReferenceException`).
- **Synthetic Normal + AoRoughMetal.** KSA's thumbnail renderer dereferences both
  channels without a null check, so every `<PbrMaterial>` must carry all three
  channels — `modExport.ts` emits shared 1×1 flat-normal + neutral-ORM `.ktx2` even
  though v1 is diffuse-only.

Key modules:

- `src/ktx/` — `decodeImage` (image → RGBA8 + mips), `encodeKtx2` (→ KTX2 bytes),
  `zstd` (WASM Zstd compress). `encodeKtx2.ts` is the ONLY place that knows the
  on-disk texture format.
- `src/three/primitives.ts` — primitive `BufferGeometry` builders (shape/param
  TYPES live in `ksa/types.ts` so the document model stays framework-agnostic).
- `src/ksa/exportGlb.ts` — geometry-only GLB ("mesh atlas") via `GLTFExporter`.
- `src/ksa/assetsXmlSerializer.ts` — the `<MeshAtlas>/<PbrMaterial>/<SubPart>` XML.
- `src/state/customAssetStore.ts` — ties descriptors ↔ IndexedDB binaries ↔ blob
  URLs ↔ the synthetic `$customCatalog` entries the scene renders (custom meshes
  flow through the EXISTING SubPartObject pipeline; `EditorScene` rebuilds them
  when `$customCatalog` changes).
- `src/state/assetDb.ts` — IndexedDB blob store under project-namespaced keys
  (`pa:<projectId>:<kind>:<assetId>`), so a project's binaries follow it through
  Duplicate and are swept on Delete (binaries are too big for the project
  snapshot; only lightweight descriptors persist there).

### Imported models (glTF)

A user can drop a `.glb` (or `.gltf` + sidecars) onto the 3D viewport (or **Add → Import
model…**) and get real KSA SubParts with their real glTF surfaces, exported into the part
mod like any other custom SubPart. **Primary doc:
[docs/importing-models.md](docs/importing-models.md)**; game contract in
[scope/custom-assets-and-mod-export.md](scope/custom-assets-and-mod-export.md) (#13–#17);
design + evidence in `plans/IMPORT_MODELS.md`. **Not yet verified in-game.**

Three non-obvious KSA constraints shape the whole design:

- **glTF node transforms are IGNORED** — the atlas loader iterates `GltfJson.Meshes[]` and
  never walks the node graph, so a node's world matrix must become baked geometry or a
  flexo **placement**; a mirrored transform is always baked (a negative placement scale
  would reverse winding and back-face-cull the piece invisible).
- **One `<PartModel>` = one `<Mesh>` + one `<Material>`, and only glTF primitive 0 is
  drawn** — so one SubPart = one mesh = one material, and a multi-material object MUST
  split at import. Every referencing node becomes one more placement (free instancing).
- **Indices are required and accessors must be float32 + tightly packed** (POSITION /
  NORMAL / TEXCOORD_0 only). Hence the two geometry accessors: the editor's tangented
  cache (MikkTSpace **de-indexes**) is never what gets exported.

Plus: `<PbrMaterial>` has five texture slots and **zero scalars**, so every glTF factor
(baseColor/metallic/roughness/occlusion/emissive) is baked into pixels at import.

Key modules: `src/three/loadModelFile.ts` (File(s) → glTF scene + the `ModelSource` façade
over `GLTFParser`), `src/ksa/importPlan.ts` (grouping + the warning catalog),
`src/ksa/importMaterials.ts` (glTF → the five slots), `src/ksa/importNormalize.ts`
(KSA-legal geometry + the batch atlas GLB), `src/ksa/importEstimates.ts` (VRAM/mod-size +
warning severities), `src/three/importedMeshCache.ts` (`importId → blob:`; editor vs raw
export geometry), `src/ui/assets/ImportReviewDialog.tsx`, and
`customAssetStore.importModelAsMeshes` / `replaceImport` / `removeImport`.

### Current scope

- **Full PBR materials (user-authored).** A reusable `CustomMaterial` (base color as a
  picked color or an image; metalness/roughness as sliders or grayscale maps; optional
  AO map, pre-packed ORM, normal map + strength) is assigned per mesh and exported as a
  complete `<PbrMaterial>` — uniform values become deduped 1×1 solid texels (KSA's
  material schema is textures-only; ORM channels are **R=AO G=rough B=metal**), and
  identical channel sets share ONE `<PbrMaterial>` across SubParts (Core's own pack
  pattern). Normal maps are uploaded in the standard glTF convention and X-flipped at
  encode (KSA negates X and derives TBN from screen-space derivatives — exported GLBs
  need no TANGENT attribute). KTX2 containers are ALWAYS `R8G8B8A8_UNORM` + linear
  DFD with sRGB **bytes** for color content — an `_SRGB` vkFormat double-gamma-decodes
  in-game (hardware view + the shader's own `gammaToLinear`). See
  `plans/CUSTOM_TEXTURES_PLAN.md` + `docs/custom-assets.md`.
- **Glow (emissive)** stays per-mesh: `EmissiveConfig` (whole / painted-canvas) baked as
  a composited diffuse + a greyscale `<Emissive>` mask. **KSA's emissive is WHITE × mask ×
  1.25 ADDED after lighting — there is no coloured emission and no LUT slot anywhere in
  `PbrMaterialReference`** (`MeshIndirect.frag:276-287`), so a glow reads pure white in
  shadow; the colour lives in the diffuse. The bitmap's alpha is the greyscale KEY and
  `coverage` (diffuse blend) / `strength` (mask value) interpret it INDEPENDENTLY — one
  slider driving both made the only setting that reads coloured in-game unauthorable. An
  optional `GlowRamp` (flexo's stand-in for KSA's 1-px gradient LUTs; importable from a
  gradient image) is evaluated on the CPU and **baked into the diffuse**. For actual
  coloured light, pair a modest mask with a `<Light>` carrying `<Color>` — the glow panel's
  "Add matching light". `<PartModelDynamic>` compiles `ENABLE_TEMPERATURE` instead of
  `ENABLE_EMISSIVE`, so emissive and ThinFilm heat can never coexist on one SubPart. The
  kitten **visor** `surface` mode (`glass` / `glow` / `glassGlow` layered two-SubPart) is
  unchanged: KSA glass ignores emissive and derives only ~10% of its color from the
  diffuse. (`src/ktx/glowComposite.ts`, `src/ktx/glowRamp.ts`, `modExport.expandGlassGlow`,
  `$simulateGlass`; full analysis in [analysis/KSA_EMISSIVE_AND_LUT.md](analysis/KSA_EMISSIVE_AND_LUT.md).)

### Deliberate limitations / later

- **Per-face textures export lossily** (KSA gets one material per SubPart — the first
  textured face wins; the UI warns). Faithful export = one SubPart per face group.
- **ThinFilm heat effects** (5th PbrMaterial slot: R=re-entry iridescence, G=heat glow,
  B=frost) need `<PartModelDynamic>` + runtime temperature — invisible on a bench part;
  see the plan's Phase 3. The G channel is the one greyscale-map-keyed-to-a-1px-LUT path
  the engine actually ships (`temperatureLut`, a global asset a mod can't replace), and it
  is **mutually exclusive with `<Emissive>`** — the two live on different compiled variants
  of `MeshIndirect.frag`, so adopting `<PartModelDynamic>` would silently kill every glow.
- **Uncompressed RGBA8 + Zstd**, not block-compressed (larger VRAM). Preferred future
  route: UASTC + a `.toml` sidecar (`scblockformatfamily` → BC7) — KSA transcodes UASTC
  natively but defaults the target to uncompressed Rgba32 without the sidecar.
- **In-game re-verification pending** for the UNORM re-tag (gray-swatch A/B), the shared
  material path (red metallic button on two meshes), and normal-map orientation.
