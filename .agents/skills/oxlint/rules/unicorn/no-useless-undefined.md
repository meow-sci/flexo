---
title: "unicorn/no-useless-undefined"
rule: "unicorn/no-useless-undefined"
category: "Pedantic"
version: "0.6.1"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-undefined.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prevents usage of `undefined` in cases where it would be useless.

> **Warning:** This rule can conflict with the default behaviors of the `eslint/array-callback-return`
> and `eslint/getter-return` rules. For both rules, you can set
> the `allowImplicit` option to avoid conflicts.


### Why is this bad?

`undefined` is the default value for new variables, parameters,
return statements, etc, so specifying `undefined` in these cases
is pointless.

### Examples

Examples of **incorrect** code for this rule:

```javascript
let foo = undefined;
const noop = () => undefined;
```

Examples of **correct** code for this rule:

```javascript
let foo;
const noop = () => {};
```

## Configuration

This rule accepts a configuration object with the following properties:

### checkArguments

type: `boolean`

default: `true`

Whether to check for useless `undefined` in function call arguments.

### checkArrowFunctionBody

type: `boolean`

default: `true`

Whether to check for useless `undefined` in arrow function bodies.

## How to use

```json
{
  "rules": {
    "unicorn/no-useless-undefined": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-useless-undefined": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.6.1.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-undefined.md)
