---
title: "vitest/expect-expect"
rule: "vitest/expect-expect"
category: "Correctness"
version: "0.0.12"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/expect-expect.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule triggers when there is no call made to `expect` in a test, ensure that there is at least one `expect` call made in a test.

### Why is this bad?

People may forget to add assertions.

### Examples

Examples of **incorrect** code for this rule:

```javascript
it("should be a test", () => {
  console.log("no assertion");
});
test("should assert something", () => {});
```

## Configuration

This rule accepts a configuration object with the following properties:

### additionalTestBlockFunctions

type: `string[]`

default: `[]`

An array of function names that should also be treated as test blocks.

### assertFunctionNames

type: `string[]`

default: `["expect"]`

A list of function names that should be treated as assertion functions.

NOTE: The default value is `["expect"]` for Jest and
`["expect", "expectTypeOf", "assert", "assertType"]` for Vitest.

## How to use

```json
{
  "rules": {
    "vitest/expect-expect": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/expect-expect": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.12.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/expect-expect.md)
