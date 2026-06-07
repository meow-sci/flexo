---
title: "eslint/no-extra-label"
rule: "eslint/no-extra-label"
category: "Style"
version: "0.15.4"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/no-extra-label"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow unnecessary labels.

### Why is this bad?

If a loop contains no nested loops or switches, labeling the loop is unnecessary.

```js
A: while (a) {
  break A;
}
```

You can achieve the same result by removing the label and using `break` or `continue` without a label.
Probably those labels would confuse developers because they expect labels to jump to further.

### Examples

Examples of **incorrect** code for this rule:

```js
A: while (a) {
  break A;
}

B: for (let i = 0; i < 10; ++i) {
  break B;
}

C: switch (a) {
  case 0:
    break C;
}
```

Examples of **correct** code for this rule:

```js
while (a) {
  break;
}

for (let i = 0; i < 10; ++i) {
  break;
}

switch (a) {
  case 0:
    break;
}

A: {
  break A;
}

B: while (a) {
  while (b) {
    break B;
  }
}

C: switch (a) {
  case 0:
    while (b) {
      break C;
    }
    break;
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-extra-label": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-extra-label": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-extra-label)
