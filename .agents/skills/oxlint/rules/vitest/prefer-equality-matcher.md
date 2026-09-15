---
title: "vitest/prefer-equality-matcher"
rule: "vitest/prefer-equality-matcher"
category: "Style"
version: "0.2.9"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-equality-matcher.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Jest has built-in matchers for expecting equality, which allow for more readable
tests and error messages if an expectation fails.

### Why is this bad?

Testing equality expressions with generic matchers like `toBe(true)`
makes tests harder to read and understand. When tests fail, the error
messages are less helpful because they don't show what the actual values
were. Using specific equality matchers provides clearer test intent and
better debugging information.

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect(x === 5).toBe(true);
expect(name === "Carl").not.toEqual(true);
expect(myObj !== thatObj).toStrictEqual(true);
```

Examples of **correct** code for this rule:

```javascript
expect(x).toBe(5);
expect(name).not.toEqual("Carl");
expect(myObj).toStrictEqual(thatObj);
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-equality-matcher": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-equality-matcher": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.9.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-equality-matcher.md)
