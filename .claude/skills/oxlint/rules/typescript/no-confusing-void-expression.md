---
title: "typescript/no-confusing-void-expression"
rule: "typescript/no-confusing-void-expression"
category: "Pedantic"
version: "1.12.0"
default: false
type_aware: true
fix: "fixable_safe_fix_or_suggestion"
upstream: "https://typescript-eslint.io/rules/no-confusing-void-expression/"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_safe_fix_or_suggestion |
| Type-aware | yes |


### What it does

This rule forbids using void expressions in confusing locations such as arrow function returns.

### Why is this bad?

The void operator is useful when you want to execute an expression while evaluating to `undefined`. However, it can be confusing when used in places where the return value is meaningful, particularly in arrow functions and conditional expressions.

### Examples

Examples of **incorrect** code for this rule:

```ts
// arrow function returning void expression
const foo = () => void bar();

// conditional expression
const result = condition ? void foo() : bar();

// void in conditional
if (void foo()) {
  // ...
}
```

Examples of **correct** code for this rule:

```ts
// proper use of void
void foo();

// explicit return statement
const foo = () => {
  bar();
  return;
};

// statement expression
foo();

// IIFE with void
void (function () {
  console.log("immediately invoked");
})();
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignoreArrowShorthand

type: `boolean`

default: `false`

Whether to ignore arrow function shorthand that returns void.
When true, allows expressions like `() => someVoidFunction()`.

### ignoreVoidOperator

type: `boolean`

default: `false`

Whether to ignore expressions using the void operator.
When true, allows `void someExpression`.

### ignoreVoidReturningFunctions

type: `boolean`

default: `false`

Whether to ignore calling functions that are declared to return void.
When true, allows expressions like `x = voidReturningFunction()`.

## How to use

```json
{
  "rules": {
    "typescript/no-confusing-void-expression": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-confusing-void-expression": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-confusing-void-expression/)
