---
title: "eslint/operator-assignment"
rule: "eslint/operator-assignment"
category: "Style"
version: "0.15.13"
default: false
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://eslint.org/docs/latest/rules/operator-assignment"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

This rule requires or disallows assignment operator shorthand where possible.
It encourages the use of shorthand assignment operators like `+=`, `-=`, `*=`, `/=`, etc.
to make the code more concise and readable.

### Why is this bad?

JavaScript provides shorthand operators that combine variable assignment and simple
mathematical operations. Failing to use these shorthand operators can lead to unnecessarily
verbose code and can be seen as a missed opportunity for clarity and simplicity.

### Examples

Examples of **incorrect** code for this rule with the default `always` option:

```js
x = x + y;
x = y * x;
x[0] = x[0] / y;
x.y = x.y << z;
```

Examples of **correct** code for this rule with the default `always` option:

```js
x = y;
x += y;
x = y * z;
x = x * y * z;
x[0] /= y;
x[foo()] = x[foo()] % 2;
x = y + x; // `+` is not always commutative (e.g. x = "abc")
```

Examples of **incorrect** code for this rule with the `never` option:

```js
x *= y;
x ^= (y + z) / foo();
```

Examples of **correct** code for this rule with the `never` option:

```js
x = x + y;
x.y = x.y / a.b;
```

## Configuration

This rule accepts one of the following string values:

### `"always"`

Requires assignment operator shorthand where possible.

### `"never"`

Disallows assignment operator shorthand.

## How to use

```json
{
  "rules": {
    "eslint/operator-assignment": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/operator-assignment": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.13.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/operator-assignment)
