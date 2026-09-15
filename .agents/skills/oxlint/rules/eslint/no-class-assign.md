---
title: "eslint/no-class-assign"
rule: "eslint/no-class-assign"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-class-assign"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow reassigning class variables.

This rule can be disabled for TypeScript code, as the TypeScript compiler
enforces this check.

### Why is this bad?

`ClassDeclaration` creates a variable that can be re-assigned, but the re-assignment is a
mistake in most cases.

### Examples

Examples of **incorrect** code for this rule:

```javascript
class A {}
A = 0;
```

```javascript
A = 0;
class A {}
```

```javascript
class A {
  b() {
    A = 0;
  }
}
```

```javascript
let A = class A {
  b() {
    A = 0;
    // `let A` is shadowed by the class name.
  }
};
```

Examples of **correct** code for this rule:

```javascript
let A = class A {};
A = 0; // A is a variable.
```

```javascript
let A = class {
  b() {
    A = 0; // A is a variable.
  }
};
```

```javascript
class A {
  b(A) {
    A = 0; // A is a parameter.
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-class-assign": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-class-assign": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-class-assign)
