---
title: "jest/valid-expect"
rule: "jest/valid-expect"
category: "Correctness"
version: "0.0.14"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/valid-expect.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Checks that `expect()` is called correctly.

### Why is this bad?

`expect()` is a function that is used to assert values in tests.
It should be called with a single argument, which is the value to be tested.
If you call `expect()` with no arguments, or with more than one argument, it will not work as expected.

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect();
expect("something");
expect(true).toBeDefined;
expect(Promise.resolve("Hi!")).resolves.toBe("Hi!");
```

Examples of **correct** code for this rule:

```javascript
expect("something").toEqual("something");
expect(true).toBeDefined();
expect(Promise.resolve("Hi!")).resolves.toBe("Hi!");
```

## Configuration

This rule accepts a configuration object with the following properties:

### alwaysAwait

type: `boolean`

default: `false`

When `true`, async assertions must be awaited in all contexts (not just return statements).

### asyncMatchers

type: `string[]`

default: `["toResolve", "toReject"]`

List of matchers that are considered async and therefore require awaiting (e.g. `toResolve`, `toReject`).

### maxArgs

type: `integer`

default: `1`

Maximum number of arguments `expect` should be called with.

### minArgs

type: `integer`

default: `1`

Minimum number of arguments `expect` should be called with.

## How to use

```json
{
  "rules": {
    "jest/valid-expect": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/valid-expect": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/valid-expect.md)
