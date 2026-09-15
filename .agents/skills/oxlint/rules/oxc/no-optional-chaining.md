---
title: "oxc/no-optional-chaining"
rule: "oxc/no-optional-chaining"
category: "Restriction"
version: "0.5.0"
default: false
type_aware: false
fix: "none"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow [optional chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining).

### Why is this bad?

You may want to use this rule if you need to maintain compatibility with older environments.
However, optional chaining has been supported in all major browsers since 2020 and is
generally safe to use today.

In some cases, transpiling optional chaining can result in verbose helper code
that impacts bundle size and performance. This rule is useful when you need to
avoid the overhead of transpiled optional chaining. This is only relevant if you
are polyfilling to support browsers from pre-2020.

In most codebases at this point, you should not use this rule.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = obj?.foo;
obj.fn?.();
```

## Configuration

This rule accepts a configuration object with the following properties:

### message

type: `string`

default: `""`

A custom help message to display when optional chaining is found.
For example, "Our output target is ES2016, and optional chaining results in verbose
helpers and should be avoided."

## How to use

```json
{
  "rules": {
    "oxc/no-optional-chaining": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/no-optional-chaining": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.0.

## References

