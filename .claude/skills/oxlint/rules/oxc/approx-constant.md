---
title: "oxc/approx-constant"
rule: "oxc/approx-constant"
category: "Suspicious"
version: "0.1.1"
default: false
type_aware: false
fix: "fixable_suggestion"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallows the use of approximate constants, instead preferring the use
of the constants in the `Math` object.

### Why is this bad?

Approximate constants are not as accurate as the constants in the `Math` object.
Using the `Math` constants improves code readability and accuracy.
See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math
for more information.

### Examples

Examples of **incorrect** code for this rule:

```javascript
let log10e = 0.434294;
```

Examples of **correct** code for this rule:

```javascript
let log10e = Math.LOG10E;
```

## How to use

```json
{
  "rules": {
    "oxc/approx-constant": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/approx-constant": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

