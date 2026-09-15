---
title: "eslint/no-sequences"
rule: "eslint/no-sequences"
category: "Restriction"
version: "1.33.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-sequences"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows the use of the comma operator.

### Why is this bad?

The comma operator evaluates each of its operands (from left to right)
and returns the value of the last operand. However, this frequently
obscures side effects, and its use is often an accident.

### Options

- `allowInParentheses` (default: `true`): If set to `false`, disallows
  the comma operator even when wrapped in parentheses.

### Examples

Examples of **incorrect** code for this rule:

```javascript
((foo = doSomething()), val);

(0, eval("doSomething();"));

// Arrow function body needs double parentheses
const fn = () => (doSomething(), val);

// with allowInParentheses: false
foo = (doSomething(), val);
```

Examples of **correct** code for this rule:

```javascript
foo = (doSomething(), val);

(0, eval)("doSomething();");

// Single extra parentheses is enough for conditions
do {} while ((doSomething(), !!test));

for (i = 0, j = 10; i < j; i++, j--) {}

// Arrow function body needs double parentheses
const fn = () => (doSomething(), val);
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowInParentheses

type: `boolean`

default: `true`

If this option is set to `false`, this rule disallows the comma operator
even when the expression sequence is explicitly wrapped in parentheses.
Default is `true`.

## How to use

```json
{
  "rules": {
    "eslint/no-sequences": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-sequences": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.33.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-sequences)
