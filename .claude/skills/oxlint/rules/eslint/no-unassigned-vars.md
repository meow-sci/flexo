---
title: "eslint/no-unassigned-vars"
rule: "eslint/no-unassigned-vars"
category: "Correctness"
version: "1.10.0"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-unassigned-vars"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow let or var variables that are read but never assigned.

### Why is this bad?

This rule flags let or var declarations that are never assigned a value but are still read or used in the code.
Since these variables will always be `undefined`, their usage is likely a programming mistake.

### Examples

Examples of **incorrect** code for this rule:

```js
let status;
if (status === "ready") {
  console.log("Ready!");
}
```

Examples of **correct** code for this rule:

```js
let message = "hello";
console.log(message);

let user;
user = getUser();
console.log(user.name);
```

## How to use

```json
{
  "rules": {
    "eslint/no-unassigned-vars": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-unassigned-vars": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.10.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-unassigned-vars)
