---
title: "oxc/only-used-in-recursion"
rule: "oxc/only-used-in-recursion"
category: "Correctness"
version: "0.1.1"
default: true
type_aware: false
fix: "fixable_dangerous_fix"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

Checks for arguments that are only used in recursion with no side-effects.

Inspired by [the `only_used_in_recursion` rule in Clippy](https://rust-lang.github.io/rust-clippy/master/#only_used_in_recursion).

### Why is this bad?

Supplying an argument that is only used in recursive calls is likely a mistake.

It increases cognitive complexity and may impact performance.

### Examples

Examples of **incorrect** code for this rule:

```ts
function test(onlyUsedInRecursion) {
  return test(onlyUsedInRecursion);
}
```

Examples of **correct** code for this rule:

```ts
function f(a: number): number {
  if (a == 0) {
    return 1;
  } else {
    return f(a - 1);
  }
}
```

## How to use

```json
{
  "rules": {
    "oxc/only-used-in-recursion": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/only-used-in-recursion": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

