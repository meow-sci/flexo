---
title: "eslint/no-inner-declarations"
rule: "eslint/no-inner-declarations"
category: "Pedantic"
version: "0.0.5"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-inner-declarations"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow variable or function declarations in nested blocks.

### Why is this bad?

A variable declaration is permitted anywhere a statement can go, even nested deeply inside other blocks.
This is often undesirable due to variable hoisting, and moving declarations to the root of the program or function body can increase clarity.
Note that block bindings (let, const) are not hoisted and therefore they are not affected by this rule.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (test) {
  function doSomethingElse() {}
}
```

Examples of **correct** code for this rule:

```javascript
function doSomethingElse() {}
if (test) {
  // your code here
}
```

## Configuration

### The 1st option

type: `"functions" | "both"`

Determines what type of declarations to check.

#### `"functions"`

Disallows function declarations in nested blocks.

#### `"both"`

Disallows function and var declarations in nested blocks.

### The 2nd option

This option is an object with the following properties:

#### blockScopedFunctions

type: `"allow" | "disallow"`

Controls whether function declarations in nested blocks are allowed in strict mode (ES6+ behavior).

##### `"allow"`

Allow function declarations in nested blocks in strict mode (ES6+ behavior).

##### `"disallow"`

Disallow function declarations in nested blocks regardless of strict mode.

## How to use

```json
{
  "rules": {
    "eslint/no-inner-declarations": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-inner-declarations": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.5.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-inner-declarations)
