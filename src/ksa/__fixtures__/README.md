# Vendored KSA asset fixtures

Byte-identical copies of a **curated subset** of the KSA "Core" asset XML, committed to
the repo so the import/parse unit tests exercise the **real** game data without the
private asset tree (`$KSA_ASSETS_DIR` — the `flexo-private-assets/assets/` repo, which is
git-ignored and not present in open-source CI).

## Files

| File                          | Why it's vendored                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `CoreFuelTankAAssets.xml`     | Fuel-tank `<Part>` / `<SubPart>` geometry (the `LF1WHalfHA` prefab and its skins).                       |
| `CoreFuelTankAGameData.xml`   | Fuel-tank `<PartGameData>` (editor tags, `<Diameter>`, `<Collider>`).                                    |
| `CoreElectricalAAssets.xml`   | Electrical `<Part>` / `<SubPart>` geometry (the `SolarPanelB` prefab).                                   |
| `CoreElectricalAGameData.xml` | Electrical `<PartGameData>` + `<SubPartGameData>` (the solar-cell `<SolarPanel>` data).                  |
| `PartGameData.xml`            | Shared file holding the fuel-tank `<SubPartGameData>` `<Tank>` metadata (the duplicate-`Id` merge case). |

Consumed by [`src/ksa/partCatalog.test.ts`](../partCatalog.test.ts) via the
`vendoredAsset` / `readVendoredAsset` helpers in [`src/ksa/ksaTestAssets.ts`](../ksaTestAssets.ts).

## ⚠️ These MUST stay in sync with the live assets

They are **verbatim copies**, never hand-edited. Whenever a vendored file's structure
changes materially in the KSA assets, re-copy it **and** update the affected
parser/catalog code + tests in the same change:

```bash
cd scripts && bun run sync-fixtures          # re-copies every *.xml here from $KSA_ASSETS_DIR
# or, from the repo root:
bun scripts/sync-test-fixtures.ts --src ../flexo-private-assets/assets
```

Enforcement: the **"vendored fixtures stay byte-identical to the live KSA assets"** test
in `partCatalog.test.ts` compares each file here byte-for-byte against `$KSA_ASSETS_DIR`
and **fails** on any drift — but only when the private tree is present (locally / private
CI). Open-source CI, which lacks the private tree, tests against these copies alone, so
stale fixtures would let a real regression pass silently. Keep them current.

**Adding a fixture:** drop the file in here once (a verbatim copy from `$KSA_ASSETS_DIR`);
`sync-test-fixtures.ts` and the drift test both discover it automatically from the
directory contents.
