---
title: "oxc/missing-throw"
rule: "oxc/missing-throw"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "fixable_suggestion"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Checks whether the `throw` keyword is missing in front of a `new` expression.

### Why is this bad?

The `throw` keyword is required in front of a `new` expression to throw an error. Omitting it is usually a mistake.

### Examples

Examples of **incorrect** code for this rule:

```javascript
function foo() {
  throw Error();
}
const foo = () => {
  new Error();
};
```

Examples of **correct** code for this rule:

```javascript
function foo() {
  throw new Error();
}
const foo = () => {
  throw new Error();
};
```

## How to use

```json
{
  "rules": {
    "oxc/missing-throw": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/missing-throw": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

