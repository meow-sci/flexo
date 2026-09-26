---
title: "eslint/no-constant-condition"
rule: "eslint/no-constant-condition"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-constant-condition"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow constant expressions in conditions.

### Why is this bad?

A constant expression (for example, a literal) as a test condition might
be a typo or development trigger for a specific behavior.

This rule disallows constant expressions in the test condition of:

- `if`, `for`, `while`, or `do...while` statement
- `?`: ternary expression

### Examples

Examples of **incorrect** code for this rule:

```js
if (false) {
  doSomethingUnfinished();
}

if (new Boolean(x)) {
  doSomethingAlways();
}
if ((x ||= true)) {
  doSomethingAlways();
}

do {
  doSomethingForever();
} while ((x = -1));
```

Examples of **correct** code for this rule:

```js
if (x === 0) {
  doSomething();
}

while (typeof x === "undefined") {
  doSomething();
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### checkLoops

type: `"all" | "allExceptWhileTrue" | "none"`

default: `"allExceptWhileTrue"`

Configuration option to specify whether to check for constant conditions in loops.

- `"all"` or `true` disallows constant expressions in loops
- `"allExceptWhileTrue"` disallows constant expressions in loops except while loops with expression `true`
- `"none"` or `false` allows constant expressions in loops

## How to use

```json
{
  "rules": {
    "eslint/no-constant-condition": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-constant-condition": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-constant-condition)
