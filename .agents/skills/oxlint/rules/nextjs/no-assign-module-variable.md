---
title: "nextjs/no-assign-module-variable"
rule: "nextjs/no-assign-module-variable"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-assign-module-variable"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents the assignment or declaration of variables named `module` in Next.js applications.

### Why is this bad?

The variable name `module` is reserved in Next.js for internal use and module system
functionality. Declaring your own `module` variable can conflict with Next.js's internal
module system, lead to unexpected behavior in your application, and cause issues with code
splitting and hot module replacement.

### Examples

Examples of **incorrect** code for this rule:

```javascript
// Declaring module variable
let module = {};

// Using module in variable declaration
const module = {
  exports: {},
};

// Assigning to module
module = { id: "my-module" };
```

Examples of **correct** code for this rule:

```javascript
// Use a different variable name
let myModule = {};

// Use a more descriptive name
const customModule = {
  exports: {},
};

// Access actual module object (when available)
console.log(module.exports);
```

## How to use

```json
{
  "rules": {
    "nextjs/no-assign-module-variable": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-assign-module-variable": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-assign-module-variable)
