---
title: "jest/no-restricted-jest-methods"
rule: "jest/no-restricted-jest-methods"
category: "Style"
version: "0.2.3"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-restricted-jest-methods.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Restrict the use of specific `jest` and `vi` methods.

### Why is this bad?

Certain Jest or Vitest methods may be deprecated, discouraged in specific
contexts, or incompatible with your testing environment. Restricting
them helps maintain consistent and reliable test practices.

By default, no methods are restricted by this rule.
You must configure the rule for it to disable anything.

### Examples

Examples of **incorrect** code for this rule:

```javascript
jest.useFakeTimers();
it("calls the callback after 1 second via advanceTimersByTime", () => {
  // ...

  jest.advanceTimersByTime(1000);

  // ...
});

test("plays video", () => {
  const spy = jest.spyOn(video, "play");

  // ...
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### restrictedJestMethods

type: `Record<string, string>`

default: `{}`

A mapping of restricted Jest method names to custom messages - or
`null`, for a generic message.

## How to use

```json
{
  "rules": {
    "jest/no-restricted-jest-methods": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/no-restricted-jest-methods": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.3.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-restricted-jest-methods.md)
