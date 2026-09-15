---
title: "import/unambiguous"
rule: "import/unambiguous"
category: "Restriction"
version: "0.11.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/unambiguous.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Warn if a `module` could be mistakenly parsed as a `script` instead of
as a pure [ES module](https://nodejs.org/api/esm.html#modules-ecmascript-modules).

### Why is this bad?

For ESM-only environments, ambiguous files may lead to unexpected results and problems.

### Examples

Examples of **incorrect** code for this rule:

```js
function x() {}

(function x() {
  return 42;
})();
```

Examples of **correct** code for this rule:

```js
import "foo";
function x() {
  return 42;
}

export function x() {
  return 42;
}

(function x() {
  return 42;
})();
export {}; // simple way to mark side-effects-only file as 'module' without any imports/exports
```

## How to use

```json
{
  "rules": {
    "import/unambiguous": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/unambiguous": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.11.1.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/unambiguous.md)
