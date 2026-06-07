---
title: "node/no-new-require"
rule: "node/no-new-require"
category: "Restriction"
version: "0.10.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/no-new-require.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Warn about calling `new` on `require`.

### Why is this bad?

The `require` function is used to include modules and might return a constructor. As this
is not always the case this can be confusing.

### Examples

Examples of **incorrect** code for this rule:

```js
var appHeader = new require("app-header");
```

Examples of **correct** code for this rule:

```js
var AppHeader = require("app-header");
var appHeader = new AppHeader();
```

## How to use

```json
{
  "rules": {
    "node/no-new-require": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "node/no-new-require": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.10.0.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/no-new-require.md)
