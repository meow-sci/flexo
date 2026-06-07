---
title: "typescript/no-meaningless-void-operator"
rule: "typescript/no-meaningless-void-operator"
category: "Correctness"
version: "1.12.0"
default: true
type_aware: true
fix: "fixable_safe_fix_or_suggestion"
upstream: "https://typescript-eslint.io/rules/no-meaningless-void-operator/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_safe_fix_or_suggestion |
| Type-aware | yes |


### What it does

This rule disallows the void operator when its argument is already of type void or `undefined`.

### Why is this bad?

The void operator is useful when you want to execute an expression and force it to evaluate to `undefined`. However, using void on expressions that are already of type void or `undefined` is meaningless and adds unnecessary complexity to the code.

### Examples

Examples of **incorrect** code for this rule:

```ts
function foo(): void {
  return;
}

void foo(); // meaningless, foo() already returns void

void undefined; // meaningless, undefined is already undefined

async function bar() {
  void (await somePromise); // meaningless if somePromise resolves to void
}
```

Examples of **correct** code for this rule:

```ts
function getValue(): number {
  return 42;
}

void getValue(); // meaningful, converts number to void

void console.log("hello"); // meaningful, console.log returns undefined but we want to be explicit

function processData() {
  // some processing
}

processData(); // no void needed since we don't care about return value
```

## Configuration

This rule accepts a configuration object with the following properties:

### checkNever

type: `boolean`

default: `false`

Whether to check `void` applied to expressions of type `never`.

## How to use

```json
{
  "rules": {
    "typescript/no-meaningless-void-operator": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-meaningless-void-operator": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-meaningless-void-operator/)
