---
title: "typescript/no-unnecessary-type-arguments"
rule: "typescript/no-unnecessary-type-arguments"
category: "Suspicious"
version: "1.12.0"
default: false
type_aware: true
fix: "fixable_fix"
upstream: "https://typescript-eslint.io/rules/no-unnecessary-type-arguments/"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_fix |
| Type-aware | yes |


### What it does

This rule disallows type arguments that are identical to the default type parameter.

### Why is this bad?

Explicit type arguments that are the same as their default values are unnecessary and add visual noise to the code. TypeScript will infer these types automatically.

### Examples

Examples of **incorrect** code for this rule:

```ts
function identity<T = string>(arg: T): T {
  return arg;
}

// Unnecessary type argument - string is the default
const result = identity<string>("hello");

interface Container<T = number> {
  value: T;
}

// Unnecessary type argument - number is the default
const container: Container<number> = { value: 42 };

class MyClass<T = boolean> {
  constructor(public value: T) {}
}

// Unnecessary type argument - boolean is the default
const instance = new MyClass<boolean>(true);
```

Examples of **correct** code for this rule:

```ts
function identity<T = string>(arg: T): T {
  return arg;
}

// Using default type
const result1 = identity("hello");

// Using different type
const result2 = identity<number>(42);

interface Container<T = number> {
  value: T;
}

// Using default type
const container1: Container = { value: 42 };

// Using different type
const container2: Container<string> = { value: "hello" };
```

## How to use

```json
{
  "rules": {
    "typescript/no-unnecessary-type-arguments": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-unnecessary-type-arguments": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-arguments/)
