---
title: "unicorn/no-accessor-recursion"
rule: "unicorn/no-accessor-recursion"
category: "Suspicious"
version: "0.16.5"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-accessor-recursion.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow recursive access to `this` within getters and setters.

### Why is this bad?

This rule prevents recursive access to `this` within getter and
setter methods in objects and classes, avoiding infinite recursion
and stack overflow errors.

### Examples

Examples of **incorrect** code for this rule:

```js
const foo = {
  get bar() {
    return this.bar;
  },
};

const baz = {
  set bar(value) {
    this.bar = value;
  },
};
```

Examples of **correct** code for this rule:

```js
const foo = {
  get bar() {
    return this.qux;
  },
};

const baz = {
  set bar(value) {
    this._bar = value;
  },
};
```

## How to use

```json
{
  "rules": {
    "unicorn/no-accessor-recursion": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-accessor-recursion": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.5.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-accessor-recursion.md)
