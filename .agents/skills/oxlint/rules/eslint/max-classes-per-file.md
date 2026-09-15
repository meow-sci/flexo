---
title: "eslint/max-classes-per-file"
rule: "eslint/max-classes-per-file"
category: "Pedantic"
version: "0.3.4"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/max-classes-per-file"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce a maximum number of classes per file.

### Why is this bad?

Files containing multiple classes can often result in a less navigable and poorly
structured codebase. Best practice is to keep each file limited to a single responsibility.

### Examples

Examples of **incorrect** code for this rule:

```javascript
class Foo {}
class Bar {}
```

Examples of **correct** code for this rule:

```js
function foo() {
  var bar = 1;
  let baz = 2;
  const qux = 3;
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignoreExpressions

type: `boolean`

default: `false`

Whether to ignore class expressions when counting classes.

### max

type: `integer`

default: `1`

The maximum number of classes allowed per file.

## How to use

```json
{
  "rules": {
    "eslint/max-classes-per-file": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/max-classes-per-file": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/max-classes-per-file)
