# ICRP → flexo `src/` imports (the shared-package manifest)

ICRP lives in the flexo repo (plans/ICRP_PLAN.md D1) and imports flexo's **pure**
modules by relative path, exactly like `apps/partpreview`. Shell/document stores
whose closed unions differ (`Mode`, `Tool`, `DialogId`, hotkey scopes,
`EntityKind`) are **copied** into `apps/icrp/src/`, never imported.

This file lists every `../../../src/...` import ICRP makes. **Keep it current**
(same commit as the import): it is the manifest for a future pnpm-workspace
extraction — everything listed here would become `packages/*`.

## Imported (shared) modules

| Module | Used for |
| --- | --- |
| `src/assetBase.ts` | shared-asset base URL (`VITE_ASSET_BASE`) |
| `src/ksa/catalog.ts` | `toUrl`, `fetchXmlFile`, `parseAssetsFile` (vessel SubParts as pieces) |
| `src/ksa/partXmlParser.ts` | `collidersFromElement`, transform/vec readers, RawXmlNode capture |
| `src/ksa/partXmlSerializer.ts` | `prettyXml`, transform/collider/distance element builders |
| `src/ksa/formatG6.ts` | .NET G6 number formatting |
| `src/ksa/types.ts` | `Vec3`, `EulerXYZ`, `Transform`, `PartCollider`, `RawXmlNode` |
| `src/three/coords.ts` | `applyPlacement` / `readPlacementTransform` (`EULER_ORDER 'ZYX'`) |

## Copied (not imported) modules

| Copy | Source | Why copied |
| --- | --- | --- |
| _(none yet)_ | | |
