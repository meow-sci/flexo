---
title: "typescript/no-import-type-side-effects"
rule: "typescript/no-import-type-side-effects"
category: "Restriction"
version: "0.5.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://typescript-eslint.io/rules/no-import-type-side-effects/"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce the use of top-level `import type` qualifier when an import only
has specifiers with inline type qualifiers.

### Why is this bad?

The `--verbatimModuleSyntax` compiler option causes TypeScript to do
simple and predictable transpilation on import declarations. Namely, it
completely removes import declarations with a top-level type qualifier,
and it removes any import specifiers with an inline type qualifier.

The latter behavior does have one potentially surprising effect in that
in certain cases TS can leave behind a "side effect" import at runtime:

```ts
import { type A, type B } from "mod";
```

is transpiled to

```ts
import {} from "mod";
// which is the same as
import "mod";
```

For the rare case of needing to import for side effects, this may be
desirable - but for most cases you will not want to leave behind an
unnecessary side effect import.

### Examples

Examples of **incorrect** code for this rule:

```ts
import { type A } from "mod";
import { type A as AA } from "mod";
import { type A, type B } from "mod";
import { type A as AA, type B as BB } from "mod";
```

Examples of **correct** code for this rule:

```ts
import type { A } from "mod";
import type { A as AA } from "mod";
import type { A, B } from "mod";
import type { A as AA, B as BB } from "mod";
```

## How to use

```json
{
  "rules": {
    "typescript/no-import-type-side-effects": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-import-type-side-effects": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-import-type-side-effects/)
