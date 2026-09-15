---
title: "eslint/no-extra-bind"
rule: "eslint/no-extra-bind"
category: "Suspicious"
version: "1.1.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.org/docs/latest/rules/no-extra-bind"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow unnecessary calls to `.bind()`.

### Why is this bad?

This rule is aimed at avoiding the unnecessary use of `bind()`
and as such will warn whenever an immediately-invoked function expression (IIFE) is using `bind()`
and doesn’t have an appropriate `this` value.
This rule won’t flag usage of `bind()` that includes function argument binding.

### Examples

Examples of **incorrect** code for this rule:

```js
const x = function () {
  foo();
}.bind(bar);

const z = (() => {
  this.foo();
}).bind(this);
```

Examples of **correct** code for this rule:

```js
const x = function () {
  this.foo();
}.bind(bar);
const y = function (a) {
  return a + 1;
}.bind(foo, bar);
```

## How to use

```json
{
  "rules": {
    "eslint/no-extra-bind": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-extra-bind": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.1.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-extra-bind)
