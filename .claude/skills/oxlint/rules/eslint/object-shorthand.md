---
title: "eslint/object-shorthand"
rule: "eslint/object-shorthand"
category: "Style"
version: "1.59.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/object-shorthand"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Require or disallow method and property shorthand syntax for object literals

### Why is this bad?

Stylistic preference

### Example

Here are a few common examples using the ES5 syntax:

```javascript
var properties = { x: x, y: y, z: z };
var methods = { a: function () {}, b: function () {} };
```

Now here are ES6 equivalents:

```javascript
var properties = { x, y, z };
var methods = { a() {}, b() {} };
```

## Configuration

### The 1st option

type: `"always" | "methods" | "properties" | "consistent" | "consistent-as-needed" | "never"`

### The 2nd option

This option is an object with the following properties:

#### avoidExplicitReturnArrows

type: `boolean`

default: `false`

#### avoidQuotes

type: `boolean`

default: `false`

#### ignoreConstructors

type: `boolean`

default: `false`

#### methodsIgnorePattern

type: `string`

## How to use

```json
{
  "rules": {
    "eslint/object-shorthand": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/object-shorthand": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.59.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/object-shorthand)
