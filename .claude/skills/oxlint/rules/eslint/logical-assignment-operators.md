---
title: "eslint/logical-assignment-operators"
rule: "eslint/logical-assignment-operators"
category: "Style"
version: "1.63.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.org/docs/latest/rules/logical-assignment-operators"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

This rule requires or disallows logical assignment operator shorthand.

### Why is this bad?

ES2021 introduces the assignment operator shorthand for the logical operators `||`, `&&` and `??`.
Before, this was only allowed for mathematical operations such as `+` or `*` (see the rule `operator-assignment`).
The shorthand can be used if the assignment target and the left expression of a logical expression are the same.
For example `a = a || b` can be shortened to `a ||= b`.

### Examples

Examples of **incorrect** code for this rule with the default `always` option:

```js
a = a || b;
a = a && b;
a = a ?? b;
a || (a = b);
a && (a = b);
a ?? (a = b);
a = a || b || c;
a = a && b && c;
a = a ?? b ?? c;
```

Examples of **correct** code for this rule with the default `always` option:

```js
a = b;
a += b;
a ||= b;
a = b || c;
a || (b = c);
if (a) a = b;
a = a || b || c;
```

Examples of **incorrect** code for this rule with the `never` option:

```js
a ||= b;
a &&= b;
a ??= b;
```

Examples of **correct** code for this rule with the `never` option:

```js
a = a || b;
a = a && b;
a = a ?? b;
```

## Configuration

### The 1st option

type: `"always" | "never"`

#### `"always"`

This option checks for expressions that can be shortened using logical assignment operator.
For example, `a = a || b` can be shortened to `a ||= b`.
Expressions with associativity such as `a = a || b || c` are reported as being able to be shortened to `a ||= b || c` unless the evaluation order is explicitly defined using parentheses, such as `a = (a || b) || c`.

#### `"never"`

This option disallows logical assignment operator shorthand.
For example, `a ||= b` should be written as `a = a || b`.

### The 2nd option

This option is an object with the following properties:

#### enforceForIfStatements

type: `boolean`

default: `false`

This option checks for additional patterns with if statements which could be expressed with the logical assignment operator.
Only available if string option is set to `always`.

Examples of **incorrect** code for this rule with the `["always", { enforceForIfStatements: true }]` option:

```js
if (a) a = b; // <=> a &&= b
if (!a) a = b; // <=> a ||= b

if (a == null) a = b; // <=> a ??= b
if (a === null || a === undefined) a = b; // <=> a ??= b
```

Examples of **correct** code for this rule with the `["always", { enforceForIfStatements: true }]` option:

```js
if (a) b = c;
if (a === 0) a = b;
```

## How to use

```json
{
  "rules": {
    "eslint/logical-assignment-operators": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/logical-assignment-operators": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.63.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/logical-assignment-operators)
