---
title: "import/no-mutable-exports"
rule: "import/no-mutable-exports"
category: "Style"
version: "0.15.13"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-mutable-exports.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Forbids the use of mutable exports with var or let.

### Why is this bad?

In general, we should always export constants

### Examples

Examples of **incorrect** code for this rule:

```js
export let count = 2;
export var count = 3;

let count = 4;
export { count };
```

Examples of **correct** code for this rule:

```js
export const count = 1;
export function getCount() {}
export class Counter {}
```

### Functions/Classes

Note that exported function/class declaration identifiers may be reassigned,
but are not flagged by this rule at this time. They may be in the future.

## How to use

```json
{
  "rules": {
    "import/no-mutable-exports": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-mutable-exports": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.13.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-mutable-exports.md)
