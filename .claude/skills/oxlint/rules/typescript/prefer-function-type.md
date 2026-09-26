---
title: "typescript/prefer-function-type"
rule: "typescript/prefer-function-type"
category: "Style"
version: "0.2.11"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://typescript-eslint.io/rules/prefer-function-type/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Enforce using function types instead of interfaces with call signatures.

### Why is this bad?

TypeScript allows for two common ways to declare a type for a function:

- Function type: `() => string`
- Object type with a signature: `{ (): string }`

The function type form is generally preferred when possible for being
more succinct and readable. Interfaces with only call signatures add
unnecessary verbosity without providing additional functionality.

### Examples

Examples of **incorrect** code for this rule:

```typescript
interface Example {
  (): string;
}

function foo(example: { (): number }): number {
  return example();
}

interface ReturnsSelf {
  (arg: string): this;
}
```

Examples of **correct** code for this rule:

```typescript
type Example = () => string;

function foo(example: () => number): number {
  return example();
}

// Returns the function itself, not the `this` argument
type ReturnsSelf = (arg: string) => ReturnsSelf;

// Multiple properties are allowed
function foo(bar: { (): string; baz: number }): string {
  return bar();
}

// Multiple call signatures (overloads) are allowed
interface Overloaded {
  (data: string): number;
  (id: number): string;
}

// this is equivalent to Overloaded interface.
type Intersection = ((data: string) => number) & ((id: number) => string);
```

## How to use

```json
{
  "rules": {
    "typescript/prefer-function-type": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/prefer-function-type": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.11.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/prefer-function-type/)
