---
title: "typescript/no-unsafe-enum-comparison"
rule: "typescript/no-unsafe-enum-comparison"
category: "Suspicious"
version: "1.12.0"
default: false
type_aware: true
fix: "fixable_suggestion"
upstream: "https://typescript-eslint.io/rules/no-unsafe-enum-comparison/"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | yes |


### What it does

This rule disallows comparing an enum value with a non-enum value.

### Why is this bad?

Enum values should only be compared with other values of the same enum type or their underlying literal values in a type-safe manner. Comparing enums with unrelated values can lead to unexpected behavior and defeats the purpose of using enums for type safety.

### Examples

Examples of **incorrect** code for this rule:

```ts
enum Status {
  Open = "open",
  Closed = "closed",
}

enum Color {
  Red = "red",
  Blue = "blue",
}

declare const status: Status;
declare const color: Color;
declare const str: string;

// Comparing enum with different enum
if (status === color) {
} // unsafe

// Comparing enum with string (unless it's a literal that matches)
if (status === str) {
} // unsafe

// Comparing with arbitrary value
if (status === "unknown") {
} // unsafe
```

Examples of **correct** code for this rule:

```ts
enum Status {
  Open = "open",
  Closed = "closed",
}

declare const status: Status;

// Comparing with same enum values
if (status === Status.Open) {
} // safe

// Comparing with the correct literal type
if (status === "open") {
} // safe

// Using enum methods
if (Object.values(Status).includes(someValue)) {
} // safe way to check
```

## How to use

```json
{
  "rules": {
    "typescript/no-unsafe-enum-comparison": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-unsafe-enum-comparison": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-unsafe-enum-comparison/)
