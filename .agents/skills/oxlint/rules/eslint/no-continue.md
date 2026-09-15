---
title: "eslint/no-continue"
rule: "eslint/no-continue"
category: "Style"
version: "0.2.14"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-continue"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow `continue` statements.

### Why is this bad?

The continue statement terminates execution of the statements in the current iteration of the current or labeled loop, and continues execution of the loop with the next iteration. When used incorrectly it makes code less testable, less readable and less maintainable. Structured control flow statements such as if should be used instead.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var sum = 0,
  i;

for (i = 0; i < 10; i++) {
  if (i >= 5) {
    continue;
  }

  sum += i;
}
```

Examples of **correct** code for this rule:

```javascript
var sum = 0,
  i;
for (i = 0; i < 10; i++) {
  if (i < 5) {
    sum += i;
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-continue": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-continue": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-continue)
