---
title: "vitest/no-importing-vitest-globals"
rule: "vitest/no-importing-vitest-globals"
category: "Style"
version: "1.49.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-importing-vitest-globals.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

The rule disallows importing any vitest global functions.

### Why is this bad?

If a project is [configured to provide Vitest functions as globals](https://vitest.dev/config/globals.html),
this rule can be used to ensure that the globals are never imported
via `import` or `require`.

Note that this rule should _not_ be used if the `globals` config
option is set to `false` in Vitest (`false` is the default configuration).

### Examples

Examples of **incorrect** code for this rule:

```js
import { test, expect } from "vitest";

test("foo", () => {
  expect(1).toBe(1);
});
```

```js
const { test, expect } = require("vitest");

test("foo", () => {
  expect(1).toBe(1);
});
```

Examples of **correct** code for this rule:

```js
test("foo", () => {
  expect(1).toBe(1);
});
```

## How to use

```json
{
  "rules": {
    "vitest/no-importing-vitest-globals": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-importing-vitest-globals": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.49.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-importing-vitest-globals.md)
