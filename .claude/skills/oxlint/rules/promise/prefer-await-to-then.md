---
title: "promise/prefer-await-to-then"
rule: "promise/prefer-await-to-then"
category: "Style"
version: "0.7.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/prefer-await-to-then.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prefer `await` to `then()`/`catch()`/`finally()` for reading Promise values.

### Why is this bad?

Async/await syntax can be seen as more readable.

### Examples

Examples of **incorrect** code for this rule:

```javascript
function foo() {
  hey.then((x) => {});
}
```

Examples of **correct** code for this rule:

```javascript
async function hi() {
  await thing();
}
```

### Example with strict mode

Examples of **incorrect** code with `{ strict: true }`:

```javascript
async function hi() {
  await thing().then((x) => {});
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### strict

type: `boolean`

default: `false`

If true, enforces the rule even after an `await` or `yield` expression.

## How to use

```json
{
  "rules": {
    "promise/prefer-await-to-then": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/prefer-await-to-then": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.1.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/prefer-await-to-then.md)
