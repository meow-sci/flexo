---
title: "oxc/bad-bitwise-operator"
rule: "oxc/bad-bitwise-operator"
category: "Restriction"
version: "0.0.3"
default: false
type_aware: false
fix: "fixable_suggestion"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

This rule applies when bitwise operators are used where logical operators are expected.

### Why is this bad?

Bitwise operators have different results from logical operators and a `TypeError` exception may be thrown because short-circuit evaluation is not applied.
(In short-circuit evaluation, right operand evaluation is skipped according to left operand value, e.g. `x` is `false` in `x && y`.)

It is obvious that logical operators are expected in the following code patterns:

```javascript
e && e.x;
e || {};
e || "";
```

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (obj & obj.prop) {
  console.log(obj.prop);
}
options = options | {};
input |= "";
```

Examples of **correct** code for this rule:

```javascript
if (obj && obj.prop) {
  console.log(obj.prop);
}
options = options || {};
input ||= "";
```

## How to use

```json
{
  "rules": {
    "oxc/bad-bitwise-operator": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/bad-bitwise-operator": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

