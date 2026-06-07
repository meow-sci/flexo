---
title: "import/named"
rule: "import/named"
category: "Nursery"
version: "0.0.13"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/named.md"
---

| Property | Value |
|----------|-------|
| Category | Nursery |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Verifies that all named imports are part of the set of named exports in
the referenced module.

For `export`, verifies that all named exports exist in the referenced
module.

Note: for packages, the plugin will find exported names from
`jsnext:main` (deprecated) or `module`, if present in `package.json`.
Redux's npm module includes this key, and thereby is lintable, for
example.

A module path that is ignored or not unambiguously an ES module will not
be reported when imported. Note that type imports and exports, as used
by Flow, are always ignored.

### Why is this bad?

Importing or exporting names that do not exist in the referenced module
can lead to runtime errors and confusion. It may suggest that certain
functionality is available when it is not, making the code harder to
maintain and understand. This rule helps ensure that your code
accurately reflects the available exports, improving reliability.

### Examples

Given

```js
// ./foo.js
export const foo = "I'm so foo";
```

Examples of **incorrect** code for this rule:

```js
// ./baz.js
import { notFoo } from "./foo";

// re-export
export { notFoo as defNotBar } from "./foo";

// will follow 'jsnext:main', if available
import { dontCreateStore } from "redux";
```

Examples of **correct** code for this rule:

```js
// ./bar.js
import { foo } from "./foo";

// re-export
export { foo as bar } from "./foo";

// node_modules without jsnext:main are not analyzed by default
// (import/ignore setting)
import { SomeNonsenseThatDoesntExist } from "react";
```

## How to use

```json
{
  "rules": {
    "import/named": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/named": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/named.md)
