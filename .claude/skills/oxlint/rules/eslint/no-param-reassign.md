---
title: "eslint/no-param-reassign"
rule: "eslint/no-param-reassign"
category: "Restriction"
version: "1.20.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-param-reassign"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow reassigning function parameters or, optionally, their properties.

### Why is this bad?

Reassigning parameters can lead to unexpected behavior, especially when relying on the
original arguments passed into the function. Mutating parameter properties can be similarly
surprising and harder to reason about.

### Examples

```javascript
function foo(bar) {
  bar = 1;
}

function baz(qux) {
  qux.prop = 2; // when `props` option is enabled
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignorePropertyModificationsFor

type: `string[]`

default: `[]`

An array of parameter names whose property modifications should be ignored.

### ignorePropertyModificationsForRegex

type: `string[]`

An array of regex patterns (as strings) for parameter names whose property modifications should be ignored.
Note that this uses [Rust regex syntax](https://docs.rs/regex/latest/regex/) and so may not have all features
available to JavaScript regexes.

### props

type: `boolean`

default: `false`

When true, also check for modifications to properties of parameters.

## How to use

```json
{
  "rules": {
    "eslint/no-param-reassign": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-param-reassign": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-param-reassign)
