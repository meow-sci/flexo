---
title: "jest/valid-title"
rule: "jest/valid-title"
category: "Correctness"
version: "0.0.14"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/valid-title.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Checks that the titles of Jest and Vitest blocks are valid.

Titles must be:

- not empty,
- strings,
- not prefixed with their block name,
- have no leading or trailing spaces.

### Why is this bad?

Titles that are not valid can be misleading and make it harder to understand the purpose of the test.

### Examples

Examples of **incorrect** code for this rule:

```javascript
describe("", () => {});
describe("foo", () => {
  it("", () => {});
});
it("", () => {});
test("", () => {});
xdescribe("", () => {});
xit("", () => {});
xtest("", () => {});
```

Examples of **correct** code for this rule:

```javascript
describe("foo", () => {});
it("bar", () => {});
test("baz", () => {});
```

### Options

```typescript
interface Options {
  ignoreSpaces?: boolean;
  ignoreTypeOfTestName?: boolean;
  ignoreTypeOfDescribeName?: boolean;
  allowArguments?: boolean;
  disallowedWords?: string[];
  mustNotMatch?: Partial<Record<"describe" | "test" | "it", string>> | string;
  mustMatch?: Partial<Record<"describe" | "test" | "it", string>> | string;
}
```

## How to use

```json
{
  "rules": {
    "jest/valid-title": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/valid-title": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/valid-title.md)
