---
title: "eslint/default-param-last"
rule: "eslint/default-param-last"
category: "Style"
version: "0.2.15"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/default-param-last"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires default parameters in functions to be the last ones.

### Why is this bad?

Placing default parameters last allows function calls to omit optional trailing arguments,
which improves readability and consistency. This rule applies equally to JavaScript and
TypeScript functions.

### Examples

Examples of **incorrect** code for this rule:

```js
/* default-param-last: "error" */

function f(a = 0, b) {}
function f(a, b = 0, c) {}
function createUser(isAdmin = false, id) {}
createUser(undefined, "tabby");
```

Examples of **correct** code for this rule:

```js
/* default-param-last: "error" */

function f(a, b = 0) {}
function f(a = 0, b = 0) {}
function createUser(id, isAdmin = false) {}
createUser("tabby");
```

Examples of **incorrect** TypeScript code for this rule:

```ts
/* default-param-last: "error" */

function greet(message: string = "Hello", name: string) {}
function combine(a: number = 1, b: number, c: number) {}
function combine(a: number, b: number = 2, c: number) {}
function combine(a: number = 1, b?: number, c: number) {}
```

Examples of **correct** TypeScript code for this rule:

```ts
/* default-param-last: "error" */

function greet(name: string, message: string = "Hello") {}
function combine(a: number, b: number = 2, c: number = 3) {}
function combine(a: number, b?: number, c: number = 3) {}
```

## How to use

```json
{
  "rules": {
    "eslint/default-param-last": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/default-param-last": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.15.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/default-param-last)
