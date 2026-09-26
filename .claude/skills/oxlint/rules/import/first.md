---
title: "import/first"
rule: "import/first"
category: "Style"
version: "0.11.1"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/first.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Forbids any non-import statements before imports except directives.

### Why is this bad?

Notably, imports are hoisted, which means the imported modules will be evaluated
before any of the statements interspersed between them.
Keeping all imports together at the top of the file may prevent surprises
resulting from this part of the spec

### Examples

Examples of **incorrect** code for this rule:

```js
import { x } from "./foo";
export { x };
import { y } from "./bar";
```

Examples of **correct** code for this rule:

```js
import { x } from "./foo";
import { y } from "./bar";
export { x, y };
```

## Configuration

This rule accepts one of the following string values:

### `"absolute-first"`

Forces absolute imports to be listed before relative imports.

Examples of **incorrect** code for this rule with `"absolute-first"`:

```js
import { x } from "./foo";
import { y } from "bar";
```

Examples of **correct** code for this rule with `"absolute-first"`:

```js
import { y } from "bar";
import { x } from "./foo";
```

### `"disable-absolute-first"`

Disables the absolute-first behavior.
This is the default behavior.

## How to use

```json
{
  "rules": {
    "import/first": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/first": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.11.1.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/first.md)
