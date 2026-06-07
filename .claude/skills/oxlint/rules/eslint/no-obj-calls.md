---
title: "eslint/no-obj-calls"
rule: "eslint/no-obj-calls"
category: "Correctness"
version: "0.0.7"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-obj-calls"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow calling some global objects as functions.

This rule can be disabled for TypeScript code, as the TypeScript compiler
enforces this check.

### Why is this bad?

Some global objects are not intended to be called as functions.
Calling them as functions will usually result in a TypeError being thrown.

### Examples

Examples of **incorrect** code for this rule:

```javascript
let math = Math();
let newMath = new Math();

let json = JSON();
let newJson = new JSON();

let atomics = Atomics();
let newAtomics = new Atomics();

let intl = Intl();
let newIntl = new Intl();

let reflect = Reflect();
let newReflect = new Reflect();
```

Examples of **correct** code for this rule:

```javascript
let area = (r) => 2 * Math.PI * r * r;
let object = JSON.parse("{}");
let first = Atomics.load(sharedArray, 0);
let segmenterFrom = Intl.Segmenter("fr", { granularity: "word" });
```

## How to use

```json
{
  "rules": {
    "eslint/no-obj-calls": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-obj-calls": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.7.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-obj-calls)
