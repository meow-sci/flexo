---
title: "eslint/no-case-declarations"
rule: "eslint/no-case-declarations"
category: "Pedantic"
version: "0.0.4"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-case-declarations"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallow lexical declarations in case clauses.

### Why is this bad?

The reason is that the lexical declaration is visible
in the entire switch block but it only gets initialized when it is assigned,
which will only happen if the case where it is defined is reached.

### Examples

Examples of **incorrect** code for this rule:

```javascript
switch (foo) {
  case 1:
    let x = 1;
    break;
  case 2:
    const y = 2;
    break;
  case 3:
    function f() {}
    break;
  default:
    class C {}
}
```

Examples of **correct** code for this rule:

```javascript
switch (foo) {
  case 1: {
    let x = 1;
    break;
  }
  case 2: {
    const y = 2;
    break;
  }
  case 3: {
    function f() {}
    break;
  }
  default: {
    class C {}
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-case-declarations": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-case-declarations": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-case-declarations)
