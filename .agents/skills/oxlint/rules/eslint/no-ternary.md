---
title: "eslint/no-ternary"
rule: "eslint/no-ternary"
category: "Style"
version: "0.2.14"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-ternary"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow ternary operators.

### Why is this bad?

The ternary operator is used to conditionally assign a value to a
variable. Some believe that the use of ternary operators leads to
unclear code.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var foo = isBar ? baz : qux;
```

```javascript
function quux() {
  return foo ? bar() : baz();
}
```

Examples of **correct** code for this rule:

```javascript
let foo;

if (isBar) {
  foo = baz;
} else {
  foo = qux;
}
```

```javascript
function quux() {
  if (foo) {
    return bar();
  } else {
    return baz();
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-ternary": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-ternary": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-ternary)
