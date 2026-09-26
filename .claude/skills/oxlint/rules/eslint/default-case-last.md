---
title: "eslint/default-case-last"
rule: "eslint/default-case-last"
category: "Style"
version: "0.0.16"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/default-case-last"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires the `default` clause in `switch` statements to be the last one.

### Why is this bad?

By convention and for readability, the `default` clause should be the last one in a `switch`.
While it is legal to place it before or between `case` clauses, doing so is confusing and may
lead to unexpected "fall-through" behavior.

### Examples

Examples of **incorrect** code for this rule:

```js
/* default-case-last: "error" */

switch (foo) {
  default:
    bar();
    break;
  case "a":
    baz();
    break;
}

switch (foo) {
  case 1:
    bar();
    break;
  default:
    baz();
    break;
  case 2:
    qux();
    break;
}
```

Examples of **correct** code for this rule:

```js
/* default-case-last: "error" */

switch (foo) {
  case 1:
    bar();
    break;
  case 2:
    qux();
    break;
  default:
    baz();
    break;
}

switch (foo) {
  case "x":
    bar();
    break;
  case "y":
  default:
    baz();
    break;
}
```

## How to use

```json
{
  "rules": {
    "eslint/default-case-last": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/default-case-last": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/default-case-last)
