---
title: "eslint/no-undefined"
rule: "eslint/no-undefined"
category: "Restriction"
version: "0.5.3"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-undefined"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow the use of `undefined` as an identifier.

### Why is this bad?

Using `undefined` directly can lead to bugs, since it can be shadowed or overwritten in JavaScript.
It's safer and more intentional to use `null` or rely on implicit `undefined` (e.g., missing return) to avoid accidental issues.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var foo = undefined;

var undefined = "foo";

if (foo === undefined) {
  // ...
}

function baz(undefined) {
  // ...
}

bar(undefined, "lorem");
```

Examples of **correct** code for this rule:

```javascript
var foo = void 0;

var Undefined = "foo";

if (typeof foo === "undefined") {
  // ...
}

global.undefined = "foo";

bar(void 0, "lorem");
```

## How to use

```json
{
  "rules": {
    "eslint/no-undefined": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-undefined": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-undefined)
