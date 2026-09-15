---
title: "typescript/no-useless-empty-export"
rule: "typescript/no-useless-empty-export"
category: "Correctness"
version: "0.4.4"
default: true
type_aware: false
fix: "fixable_fix"
upstream: "https://typescript-eslint.io/rules/no-useless-empty-export/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow empty exports that don't change anything in a module file.

### Why is this bad?

An empty `export {}` statement is sometimes useful in TypeScript code to
turn a file that would otherwise be a script file into a module file.
Per the [TypeScript Handbook Modules page](https://www.typescriptlang.org/docs/handbook/modules/introduction.html):

In TypeScript, just as in ECMAScript 2015, any file containing a
top-level import or export is considered a module. Conversely, a file
without any top-level import or export declarations is treated as a
script whose contents are available in the global scope (and therefore
to modules as well).

However, an `export {}` statement does nothing if there are any other
top-level import or export statements in a file.

This rule reports an `export {}` that doesn't do anything in a file
already using ES modules.

### Examples

Examples of **incorrect** code for this rule:

```ts
export const value = "Hello, world!";
export {};
```

Examples of **correct** code for this rule:

```ts
export const value = "Hello, world!";
```

## How to use

```json
{
  "rules": {
    "typescript/no-useless-empty-export": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-useless-empty-export": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.4.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-useless-empty-export/)
