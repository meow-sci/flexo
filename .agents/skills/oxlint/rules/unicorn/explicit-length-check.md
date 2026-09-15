---
title: "unicorn/explicit-length-check"
rule: "unicorn/explicit-length-check"
category: "Pedantic"
version: "0.0.19"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/explicit-length-check.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Enforce explicitly comparing the `length` or `size` property of a value.

### Why is this bad?

Using the explicit `length` or `size` properties can help make code clearer
and easier to understand, as it avoids relying on implicit truthy/falsy
evaluations.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const isEmpty = foo.length == 0;
const isEmpty = foo.length < 1;
const isEmpty = 0 === foo.length;
const isEmpty = 0 == foo.length;
const isEmpty = 1 > foo.length;

const isEmpty = !foo.length;
const isEmpty = !(foo.length > 0);
const isEmptySet = !foo.size;
```

Examples of **correct** code for this rule:

```javascript
const isEmpty = foo.length === 0;

if (foo.length > 0 || bar.length > 0) {
}

const unicorn = foo.length > 0 ? 1 : 2;
```

## Configuration

This rule accepts a configuration object with the following properties:

### non-zero

type: `"greater-than" | "not-equal"`

default: `"greater-than"`

Configuration option to specify how non-zero length checks should be enforced.

#### `"greater-than"`

Enforces non-zero to be checked with `foo.length > 0`.

#### `"not-equal"`

Enforces non-zero to be checked with `foo.length !== 0`.

## How to use

```json
{
  "rules": {
    "unicorn/explicit-length-check": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/explicit-length-check": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/explicit-length-check.md)
