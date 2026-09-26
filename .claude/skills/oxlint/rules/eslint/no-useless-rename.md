---
title: "eslint/no-useless-rename"
rule: "eslint/no-useless-rename"
category: "Correctness"
version: "0.2.14"
default: true
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/no-useless-rename"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow renaming import, export, and destructured assignments to the same name.

### Why is this bad?

It is unnecessary to rename a variable to the same name.

### Examples

Examples of **incorrect** code for this rule:

```javascript
import { foo as foo } from "foo";
const { bar: bar } = obj;
export { baz as baz };
```

Examples of **correct** code for this rule:

```javascript
import { foo } from "foo";
const { bar: renamed } = obj;
export { baz };
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignoreDestructuring

type: `boolean`

default: `false`

When set to `true`, allows using the same name in destructurings.

### ignoreExport

type: `boolean`

default: `false`

When set to `true`, allows renaming exports to the same name.

### ignoreImport

type: `boolean`

default: `false`

When set to `true`, allows renaming imports to the same name.

## How to use

```json
{
  "rules": {
    "eslint/no-useless-rename": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-useless-rename": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-useless-rename)
