---
title: "eslint/no-extra-boolean-cast"
rule: "eslint/no-extra-boolean-cast"
category: "Correctness"
version: "0.0.8"
default: true
type_aware: false
fix: "conditional_safe_fix_or_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-extra-boolean-cast"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | conditional_safe_fix_or_suggestion |
| Type-aware | no |


### What it does

This rule disallows unnecessary boolean casts.

### Why is this bad?

In contexts such as an if statement's test where the result of the expression will already be coerced to a Boolean,
casting to a Boolean via double negation (`!!`) or a `Boolean` call is unnecessary.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var foo = !!!bar;
var foo = Boolean(!!bar);

if (!!foo) {
}
if (Boolean(foo)) {
}

// with "enforceForInnerExpressions" option enabled
if (!!foo || bar) {
}
```

Examples of **correct** code for this rule:

```javascript
var foo = !bar;
var foo = Boolean(bar);

if (foo) {
}
if (foo) {
}

// with "enforceForInnerExpressions" option enabled
if (foo || bar) {
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### enforceForInnerExpressions

type: `boolean`

default: `false`

when set to `true`, in addition to checking default contexts, checks
whether extra boolean casts are present in expressions whose result is
used in a boolean context. See examples below. Default is `false`,
meaning that this rule by default does not warn about extra booleans
cast inside inner expressions.

## How to use

```json
{
  "rules": {
    "eslint/no-extra-boolean-cast": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-extra-boolean-cast": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.8.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-extra-boolean-cast)
