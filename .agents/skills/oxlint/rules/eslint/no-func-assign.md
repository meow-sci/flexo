---
title: "eslint/no-func-assign"
rule: "eslint/no-func-assign"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-func-assign"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow reassigning `function` declarations.

This rule can be disabled for TypeScript code, as the TypeScript compiler
enforces this check.

### Why is this bad?

Overwriting/reassigning a function written as a FunctionDeclaration is often indicative of
a mistake or issue.

### Examples

Examples of **incorrect** code for this rule:

```javascript
function foo() {}
foo = bar;
```

```javascript
function foo() {
  foo = bar;
}
```

```javascript
let a = function hello() {
  hello = 123;
};
```

Examples of **correct** code for this rule:

```javascript
let foo = function () {};
foo = bar;
```

```javascript
function baz(baz) {
  // `baz` is shadowed.
  baz = bar;
}
```

```
function qux() {
  const qux = bar;  // `qux` is shadowed.
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-func-assign": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-func-assign": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-func-assign)
