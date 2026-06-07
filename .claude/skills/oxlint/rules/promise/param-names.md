---
title: "promise/param-names"
rule: "promise/param-names"
category: "Style"
version: "0.6.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/param-names.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce standard parameter names for Promise constructors.

### Why is this bad?

Ensures that new Promise() is instantiated with the parameter names resolve, reject to
avoid confusion with order such as reject, resolve. The Promise constructor uses the
RevealingConstructor pattern. Using the same parameter names as the language specification
makes code more uniform and easier to understand.

### Examples

Examples of **incorrect** code for this rule:

```javascript
new Promise(function (reject, resolve) {
  /* ... */
}); // incorrect order
new Promise(function (ok, fail) {
  /* ... */
}); // non-standard parameter names
```

Examples of **correct** code for this rule:

```javascript
new Promise(function (resolve, reject) {});
```

## Configuration

This rule accepts a configuration object with the following properties:

### rejectPattern

type: `string`

Regex pattern used to validate the `reject` parameter name. If provided, this pattern
is used instead of the default `^_?reject$` check.

### resolvePattern

type: `string`

Regex pattern used to validate the `resolve` parameter name. If provided, this pattern
is used instead of the default `^_?resolve$` check.

## How to use

```json
{
  "rules": {
    "promise/param-names": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/param-names": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.6.1.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/param-names.md)
