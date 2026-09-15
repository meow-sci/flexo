---
title: "eslint/guard-for-in"
rule: "eslint/guard-for-in"
category: "Style"
version: "0.2.14"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/guard-for-in"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Require for-in loops to include an if statement.

### Why is this bad?

Looping over objects with a `for in` loop will include properties that are inherited through
the prototype chain. Using a `for in` loop without filtering the results in the loop can
lead to unexpected items in your for loop which can then lead to unexpected behaviour.

### Examples

Examples of **incorrect** code for this rule:

```javascript
for (key in foo) {
  doSomething(key);
}
```

Examples of **correct** code for this rule:

```javascript
for (key in foo) {
  if (Object.hasOwn(foo, key)) {
    doSomething(key);
  }
}
```

```javascript
for (key in foo) {
  if (Object.prototype.hasOwnProperty.call(foo, key)) {
    doSomething(key);
  }
}
```

```javascript
for (key in foo) {
  if ({}.hasOwnProperty.call(foo, key)) {
    doSomething(key);
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/guard-for-in": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/guard-for-in": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/guard-for-in)
