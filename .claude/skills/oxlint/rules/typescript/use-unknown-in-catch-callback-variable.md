---
title: "typescript/use-unknown-in-catch-callback-variable"
rule: "typescript/use-unknown-in-catch-callback-variable"
category: "Restriction"
version: "1.12.0"
default: false
type_aware: true
fix: "fixable_suggestion"
upstream: "https://typescript-eslint.io/rules/use-unknown-in-catch-callback-variable/"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | yes |


### What it does

This rule enforces using `unknown` for catch clause variables instead of `any`.

### Why is this bad?

In TypeScript 4.0+, catch clause variables can be typed as `unknown` instead of `any`. Using `unknown` is safer because it forces you to perform type checking before using the error, preventing potential runtime errors.

### Examples

Examples of **incorrect** code for this rule:

```ts
try {
  somethingRisky();
} catch (error: any) {
  // Should use 'unknown'
  console.log(error.message); // Unsafe access
  error.someMethod(); // Unsafe call
}

// Default catch variable is 'any' in older TypeScript
try {
  somethingRisky();
} catch (error) {
  // Implicitly 'any'
  console.log(error.message); // Unsafe access
}
```

Examples of **correct** code for this rule:

```ts
try {
  somethingRisky();
} catch (error: unknown) {
  // Type guard for Error objects
  if (error instanceof Error) {
    console.log(error.message); // Safe access
    console.log(error.stack);
  } else {
    console.log("Unknown error:", error);
  }
}

// More comprehensive error handling
try {
  somethingRisky();
} catch (error: unknown) {
  if (error instanceof Error) {
    // Handle Error objects
    console.error("Error:", error.message);
  } else if (typeof error === "string") {
    // Handle string errors
    console.error("String error:", error);
  } else {
    // Handle unknown error types
    console.error("Unknown error type:", error);
  }
}

// Helper function for error handling
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

try {
  somethingRisky();
} catch (error: unknown) {
  if (isError(error)) {
    console.log(error.message);
  }
}
```

## How to use

```json
{
  "rules": {
    "typescript/use-unknown-in-catch-callback-variable": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/use-unknown-in-catch-callback-variable": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/use-unknown-in-catch-callback-variable/)
