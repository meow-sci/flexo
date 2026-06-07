---
title: "unicorn/no-typeof-undefined"
rule: "unicorn/no-typeof-undefined"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "fixable_safe_fix_or_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-typeof-undefined.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_safe_fix_or_suggestion |
| Type-aware | no |


### What it does

Disallow `typeof` comparisons with `undefined`.

### Why is this bad?

Checking if a value is `undefined` by using `typeof value === 'undefined'` is needlessly verbose. It's generally better to compare against `undefined` directly. The only time `typeof` is needed is when a global variable potentially does not exists, in which case, using `globalThis.value === undefined` may be better.

### Examples

Examples of **incorrect** code for this rule:

```javascript
typeof foo === "undefined";
```

Examples of **correct** code for this rule:

```javascript
foo === undefined;
```

## Configuration

This rule accepts a configuration object with the following properties:

### checkGlobalVariables

type: `boolean`

default: `false`

If set to `true`, also report `typeof x === "undefined"` when `x` may be a global
variable that is not declared (commonly checked via `typeof foo === "undefined"`).

## How to use

```json
{
  "rules": {
    "unicorn/no-typeof-undefined": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-typeof-undefined": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-typeof-undefined.md)
