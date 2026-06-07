---
title: "import/default"
rule: "import/default"
category: "Correctness"
version: "0.0.13"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/default.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

If a default import is requested, this rule will report if there is no
default export in the imported module.

### Why is this bad?

Using a default import when there is no default export can lead to
confusion and runtime errors. It can make the code harder to understand
and maintain, as it may suggest that a module has a default export
when it does not, leading to unexpected behavior.

### Examples

Examples of **incorrect** code for this rule:

```javascript
// ./bar.js
export function bar() {
  return null;
}

// ./foo.js
import bar from "./bar"; // no default export found in ./bar
```

Examples of **correct** code for this rule:

```javascript
// ./bar.js
export default function bar() {
  return null;
}

// ./foo.js
import { bar } from "./bar"; // correct usage of named import
```

## How to use

```json
{
  "rules": {
    "import/default": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/default": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/default.md)
