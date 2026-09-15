---
title: "eslint/no-unexpected-multiline"
rule: "eslint/no-unexpected-multiline"
category: "Suspicious"
version: "0.9.7"
default: false
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://eslint.org/docs/latest/rules/no-unexpected-multiline"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

In most cases, semicolons are not required in JavaScript in order for code to be parsed
and executed as expected. Typically this occurs because semicolons are automatically
inserted based on a fixed set of rules. This rule exists to detect those cases where a semicolon
is NOT inserted automatically, and may be parsed differently than expected.

### Why is this bad?

Code that has unexpected newlines may be parsed and executed differently than what the
developer intended. This can lead to bugs that are difficult to track down.

### Examples

Examples of **incorrect** code for this rule:

```js
var a = b(x || y).doSomething();

var a = b[(a, b, c)].forEach(doSomething);

let x = (function () {})`hello`;

foo / bar / g.test(baz);
```

Examples of **correct** code for this rule:

```js
var a = b;
(x || y).doSomething();

var a = b;
[a, b, c].forEach(doSomething);

let x = function () {};
`hello`;

foo;
/bar/g.test(baz);
```

## How to use

```json
{
  "rules": {
    "eslint/no-unexpected-multiline": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-unexpected-multiline": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.7.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-unexpected-multiline)
