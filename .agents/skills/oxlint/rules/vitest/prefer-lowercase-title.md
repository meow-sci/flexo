---
title: "vitest/prefer-lowercase-title"
rule: "vitest/prefer-lowercase-title"
category: "Style"
version: "0.15.9"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-lowercase-title.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce `it`, `test`, `describe`, and `bench` to have descriptions that begin with a
lowercase letter. This provides more readable test failures.

### Why is this bad?

Lowercase messages for test failures generally result in more grammatically correct
failure messages when you have a test failure.

### Examples

Examples of **incorrect** code for this rule:

```javascript
it("Adds 1 + 2 to equal 3", () => {
  expect(sum(1, 2)).toBe(3);
});
```

Examples of **correct** code for this rule:

```javascript
it("adds 1 + 2 to equal 3", () => {
  expect(sum(1, 2)).toBe(3);
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowedPrefixes

type: `string[]`

default: `[]`

This array option allows specifying prefixes, which contain capitals that titles
can start with. This can be useful when writing tests for API endpoints, where
you'd like to prefix with the HTTP method.
By default, nothing is allowed (the equivalent of `{ "allowedPrefixes": [] }`).

Example of **correct** code for the `{ "allowedPrefixes": ["GET"] }` option:

```js
/* jest/prefer-lowercase-title: ["error", { "allowedPrefixes": ["GET"] }] */
describe("GET /live");
```

### ignore

type: `string[]`

default: `[]`

This array option controls which Jest or Vitest functions are checked by this rule. There
are four possible values:

- `"describe"`
- `"test"`
- `"it"`
- `"bench"`

By default, none of these options are enabled (the equivalent of
`{ "ignore": [] }`).

Example of **correct** code for the `{ "ignore": ["describe"] }` option:

```js
/* jest/prefer-lowercase-title: ["error", { "ignore": ["describe"] }] */
describe("Uppercase description");
```

Example of **correct** code for the `{ "ignore": ["test"] }` option:

```js
/* jest/prefer-lowercase-title: ["error", { "ignore": ["test"] }] */
test("Uppercase description");
```

Example of **correct** code for the `{ "ignore": ["it"] }` option:

```js
/* jest/prefer-lowercase-title: ["error", { "ignore": ["it"] }] */
it("Uppercase description");
```

### ignoreTopLevelDescribe

type: `boolean`

default: `false`

This option can be set to allow only the top-level `describe` blocks to have a
title starting with an upper-case letter.

Example of **correct** code for the `{ "ignoreTopLevelDescribe": true }` option:

```js
/* jest/prefer-lowercase-title: ["error", { "ignoreTopLevelDescribe": true }] */
describe("MyClass", () => {
  describe("#myMethod", () => {
    it("does things", () => {
      //
    });
  });
});
```

### lowercaseFirstCharacterOnly

type: `boolean`

default: `true`

This option can be set to only validate that the first character of a test name is lowercased.

Example of **correct** code for the `{ "lowercaseFirstCharacterOnly": true }` option:

```js
/* vitest/prefer-lowercase-title: ["error", { "lowercaseFirstCharacterOnly": true }] */
describe("myClass", () => {
  describe("myMethod", () => {
    it("does things", () => {
      //
    });
  });
});
```

Example of **incorrect** code for the `{ "lowercaseFirstCharacterOnly": true }` option:

```js
/* vitest/prefer-lowercase-title: ["error", { "lowercaseFirstCharacterOnly": true }] */
describe("MyClass", () => {
  describe("MyMethod", () => {
    it("does things", () => {
      //
    });
  });
});
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-lowercase-title": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-lowercase-title": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.9.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-lowercase-title.md)
