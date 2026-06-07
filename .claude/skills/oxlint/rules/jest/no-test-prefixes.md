---
title: "jest/no-test-prefixes"
rule: "jest/no-test-prefixes"
category: "Style"
version: "0.0.7"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-test-prefixes.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Require using `.only` and `.skip` over `f` and `x`.

### Why is this bad?

Jest allows you to choose how you want to define focused and skipped tests,
with multiple permutations for each:

- only & skip: it.only, test.only, describe.only, it.skip, test.skip, describe.skip.
- 'f' & 'x': fit, fdescribe, xit, xtest, xdescribe.

This rule enforces usages from the only & skip list.

### Examples

Examples of **incorrect** code for this rule:

```javascript
fit("foo"); // invalid
fdescribe("foo"); // invalid
xit("foo"); // invalid
xtest("foo"); // invalid
xdescribe("foo"); // invalid
```

## How to use

```json
{
  "rules": {
    "jest/no-test-prefixes": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/no-test-prefixes": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.7.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-test-prefixes.md)
