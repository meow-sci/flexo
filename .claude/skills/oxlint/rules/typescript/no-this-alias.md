---
title: "typescript/no-this-alias"
rule: "typescript/no-this-alias"
category: "Correctness"
version: "0.0.7"
default: true
type_aware: false
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-this-alias/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow aliasing of `this`.

### Why is this bad?

Assigning a variable to `this` instead of properly using
arrow lambdas may be a symptom of pre-ES2015 practices or not managing scope well.

### Examples

Examples of **incorrect** code for this rule:

```js
const self = this;

setTimeout(function () {
  self.doWork();
});
```

Examples of **correct** code for this rule:

```js
setTimeout(() => {
  this.doWork();
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowDestructuring

type: `boolean`

default: `true`

Whether to allow destructuring of `this` to local variables.

### allowedNames

type: `string[]`

default: `[]`

An array of variable names that are allowed to alias `this`.

## How to use

```json
{
  "rules": {
    "typescript/no-this-alias": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-this-alias": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.7.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-this-alias/)
