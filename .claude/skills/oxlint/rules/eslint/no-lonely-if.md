---
title: "eslint/no-lonely-if"
rule: "eslint/no-lonely-if"
category: "Pedantic"
version: "0.16.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.org/docs/latest/rules/no-lonely-if"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow `if` statements as the only statement in `else` blocks.

### Why is this bad?

When an `if` statement is the only statement in an `else` block, it is often clearer to use
an `else if` instead.

### Examples

Examples of **incorrect** code for this rule:

```js
if (condition) {
  // ...
} else {
  if (anotherCondition) {
    // ...
  }
}
```

```js
if (condition) {
  // ...
} else {
  if (anotherCondition) {
    // ...
  } else {
    // ...
  }
}
```

Examples of **correct** code for this rule:

```js
if (condition) {
  // ...
} else if (anotherCondition) {
  // ...
}
```

```js
if (condition) {
  // ...
} else if (anotherCondition) {
  // ...
} else {
  // ...
}
```

```js
if (condition) {
  // ...
} else {
  if (anotherCondition) {
    // ...
  }
  doSomething();
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-lonely-if": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-lonely-if": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-lonely-if)
