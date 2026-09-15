---
title: "eslint/no-useless-backreference"
rule: "eslint/no-useless-backreference"
category: "Correctness"
version: "0.16.10"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-useless-backreference"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallows backreferences in regular expressions that will always be ignored
because the capture group they refer to has not matched and cannot match
at the time the backreference is evaluated.

### Why is this bad?

Useless backreferences can lead to confusing or misleading regular expressions.
They may give the impression that a group’s value is being reused, but due to
the structure of the pattern (e.g., order of evaluation, disjunctions, or negative
lookarounds), the group has not matched anything — so the reference always
resolves to an empty string. This is almost always a mistake and makes patterns
harder to understand and maintain.

### Examples

Examples of **incorrect** code for this rule:

```js
/\1(a)/; // backreference appears before group
/(a|\1b)/; // group and reference are in different alternatives
/(?<=\1(a))b/; // backreference used before group in lookbehind
/\1(?!(a))/; // group is inside negative lookahead
/(a\1)/; // backreference is inside its own group
```

Examples of **correct** code for this rule:

```js
/(a)\1/; // valid — backreference follows completed group
/(?<name>a)\k<name>/; // named group used properly
/(?:a|(b))\1/; // backreference only used when group matches
```

## How to use

```json
{
  "rules": {
    "eslint/no-useless-backreference": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-useless-backreference": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.10.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-useless-backreference)
