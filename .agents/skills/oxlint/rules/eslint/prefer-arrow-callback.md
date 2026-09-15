---
title: "eslint/prefer-arrow-callback"
rule: "eslint/prefer-arrow-callback"
category: "Style"
version: "1.65.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/prefer-arrow-callback"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Requires using arrow functions for callbacks.

### Why is this bad?

Arrow functions are generally better suited for callbacks because they:

- inherit `this` from the surrounding scope, avoiding a common source of bugs;
- are shorter and easier to read;
- cannot be used as constructors, which is desirable for callbacks.

### Options

```json
{
  "prefer-arrow-callback": [
    "error",
    {
      "allowNamedFunctions": false,
      "allowUnboundThis": true
    }
  ]
}
```

- `allowNamedFunctions` (default `false`) — when `true`, named function
  expressions are allowed.
- `allowUnboundThis` (default `true`) — when `false`, function
  expressions that reference `this` are reported even when they are not
  bound to a `this` value.

### Examples

Examples of **incorrect** code for this rule:

```js
foo(function (a) {
  return a;
});
foo(
  function () {
    return this.a;
  }.bind(this),
);
```

Examples of **correct** code for this rule:

```js
foo((a) => a);
foo(function* () {
  yield;
});
foo(function () {
  this;
});
foo(function bar() {
  bar();
});
```

## Configuration

### allowNamedFunctions

type: `boolean`

default: `false`

### allowUnboundThis

type: `boolean`

default: `true`

## How to use

```json
{
  "rules": {
    "eslint/prefer-arrow-callback": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/prefer-arrow-callback": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.65.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/prefer-arrow-callback)
