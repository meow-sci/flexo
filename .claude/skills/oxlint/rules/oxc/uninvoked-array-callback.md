---
title: "oxc/uninvoked-array-callback"
rule: "oxc/uninvoked-array-callback"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

This rule applies when an Array function has a callback argument used for an array with empty slots.

### Why is this bad?

When the Array constructor is called with a single number argument, an array with the specified number of empty slots (not actual `undefined` values) is constructed.
If a callback function is passed to the function of this array, the callback function is never invoked because the array has no actual elements.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const list = new Array(5).map((_) => createElement());
```

Examples of **correct** code for this rule:

```javascript
const list = new Array(5).fill().map((_) => createElement());
```

## How to use

```json
{
  "rules": {
    "oxc/uninvoked-array-callback": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/uninvoked-array-callback": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

