---
title: "eslint/no-extend-native"
rule: "eslint/no-extend-native"
category: "Suspicious"
version: "0.9.7"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-extend-native"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents extending native global objects such as `Object`, `String`, or `Array` with new
properties.

### Why is this bad?

Extending native objects can cause unexpected behavior and conflicts with other code.

For example:

```js
// Adding a new property, which might seem okay
Object.prototype.extra = 55;

// Defining a user object
const users = {
  1: "user1",
  2: "user2",
};

for (const id in users) {
  // This will print "extra" as well as "1" and "2":
  console.log(id);
}
```

### Examples

Examples of **incorrect** code for this rule:

```js
Object.prototype.p = 0;
Object.defineProperty(Array.prototype, "p", { value: 0 });
```

Examples of **correct** code for this rule:

```js
x.prototype.p = 0;
Object.defineProperty(x.prototype, "p", { value: 0 });
```

## Configuration

This rule accepts a configuration object with the following properties:

### exceptions

type: `string[]`

default: `[]`

A list of objects which are allowed to be exceptions to the rule.

## How to use

```json
{
  "rules": {
    "eslint/no-extend-native": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-extend-native": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.7.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-extend-native)
