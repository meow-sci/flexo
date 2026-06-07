---
title: "jest/padding-around-test-blocks"
rule: "jest/padding-around-test-blocks"
category: "Style"
version: "1.13.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/padding-around-test-blocks.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule enforces a line of padding before and after 1 or more
`test`/`it` statements.

### Why is this bad?

Inconsistent formatting of code can make the code more difficult to read
and follow. This rule helps ensure that test blocks are visually
separated from the rest of the code, making them easier to identify while
looking through test files.

### Examples

Examples of **incorrect** code for this rule:

```js
const thing = 123;
test("foo", () => {});
test("bar", () => {});
```

```js
const thing = 123;
it("foo", () => {});
it("bar", () => {});
```

Examples of **correct** code for this rule:

```js
const thing = 123;

test("foo", () => {});

test("bar", () => {});
```

```js
const thing = 123;

it("foo", () => {});

it("bar", () => {});
```

## How to use

```json
{
  "rules": {
    "jest/padding-around-test-blocks": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/padding-around-test-blocks": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.13.0.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/padding-around-test-blocks.md)
