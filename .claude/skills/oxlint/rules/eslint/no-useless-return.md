---
title: "eslint/no-useless-return"
rule: "eslint/no-useless-return"
category: "Pedantic"
version: "1.32.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.org/docs/latest/rules/no-useless-return"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallows redundant return statements.

### Why is this bad?

A `return;` statement with nothing after it is redundant, and has no effect
on the runtime behavior of a function. This can be confusing, so it's better
to disallow these redundant statements.

### Examples

Examples of **incorrect** code for this rule:

```js
function foo() {
  return;
}

function bar() {
  doSomething();
  return;
}

function baz() {
  if (condition) {
    doSomething();
    return;
  }
}
```

Examples of **correct** code for this rule:

```js
function foo() {
  return 5;
}

function bar() {
  if (condition) {
    return;
  }
  doSomething();
}

function baz() {
  return doSomething();
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-useless-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-useless-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.32.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-useless-return)
