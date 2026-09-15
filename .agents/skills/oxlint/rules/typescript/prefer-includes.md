---
title: "typescript/prefer-includes"
rule: "typescript/prefer-includes"
category: "Pedantic"
version: "1.29.0"
default: false
type_aware: true
fix: "fixable_fix"
upstream: "https://typescript-eslint.io/rules/prefer-includes/"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | yes |


### What it does

Enforce using `.includes()` instead of `.indexOf() !== -1` or `/regex/.test()`.

### Why is this bad?

`.includes()` is more readable and expressive than checking `.indexOf() !== -1`.
It clearly communicates the intent to check for the presence of a value.
Additionally, for simple string searches, `.includes()` is often preferred over
regex `.test()` for better performance and clarity.

### Examples

Examples of **incorrect** code for this rule:

```ts
// Using indexOf
const str = "hello world";
if (str.indexOf("world") !== -1) {
  console.log("found");
}

if (str.indexOf("world") != -1) {
  console.log("found");
}

if (str.indexOf("world") > -1) {
  console.log("found");
}

// Using regex test for simple strings
if (/world/.test(str)) {
  console.log("found");
}

// Arrays
const arr = [1, 2, 3];
if (arr.indexOf(2) !== -1) {
  console.log("found");
}
```

Examples of **correct** code for this rule:

```ts
// Using includes for strings
const str = "hello world";
if (str.includes("world")) {
  console.log("found");
}

// Using includes for arrays
const arr = [1, 2, 3];
if (arr.includes(2)) {
  console.log("found");
}

// Complex regex patterns are allowed
if (/wo+rld/.test(str)) {
  console.log("found");
}

// Regex with flags
if (/world/i.test(str)) {
  console.log("found");
}
```

## How to use

```json
{
  "rules": {
    "typescript/prefer-includes": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/prefer-includes": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.29.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/prefer-includes/)
