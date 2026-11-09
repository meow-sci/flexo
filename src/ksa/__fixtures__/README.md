# Vendored KSA XML fixtures

These byte-identical Core XML files are copied from build **2026.11.10.5801**.
They include the complete Part/SubPart content closure in `coreFiles.ts`, plus
physics and launch-pad fixtures used by other suites. They contain no licensed
binary assets. The catalog tests resolve this closure offline and compare each
fixture against the private mirror when it is available.

After an asset update, run `bun scripts/sync-test-fixtures.ts --src
../flexo-private-assets/assets` from the repository root, then update tests and
schema handling together. Add newly required dependency XML as verbatim copies;
never edit a fixture by hand.
