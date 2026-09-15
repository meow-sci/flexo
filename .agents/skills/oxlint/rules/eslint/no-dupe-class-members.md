---
title: "eslint/no-dupe-class-members"
rule: "eslint/no-dupe-class-members"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-dupe-class-members"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow duplicate class members.

This rule can be disabled for TypeScript code, as the TypeScript compiler
enforces this check.

### Why is this bad?

If there are declarations of the same name in class members,
the last declaration overwrites other declarations silently. It can cause unexpected behaviors.

### Examples

Examples of **incorrect** code for this rule:

```javascript
class A {
  foo() {
    console.log("foo");
  }
  foo = 123;
}
let a = new A();
a.foo(); // Uncaught TypeError: a.foo is not a function
```

Examples of **correct** code for this rule:

```javascript
class A {
  foo() {
    console.log("foo");
  }
}
let a = new A();
a.foo();
```

## How to use

```json
{
  "rules": {
    "eslint/no-dupe-class-members": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-dupe-class-members": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-dupe-class-members)
