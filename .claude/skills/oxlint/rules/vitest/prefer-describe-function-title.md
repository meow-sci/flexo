---
title: "vitest/prefer-describe-function-title"
rule: "vitest/prefer-describe-function-title"
category: "Style"
version: "1.39.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-describe-function-title.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

When testing a specific function, this rule aims to enforce passing a named function to `describe()`
instead of an equivalent hardcoded string.

### Why is this bad?

For tests that are related to a specific function, if the function being tested is renamed,
the describe title will no longer match and can cause confusion in the future. Using the function
directly ensures consistency even if the function is renamed.

### Examples

Examples of **incorrect** code for this rule:

```js
// myFunction.test.js
import { myFunction } from "./myFunction";

describe("myFunction", () => {
  // ...
});
```

Examples of **correct** code for this rule:

```js
// myFunction.test.js
import { myFunction } from "./myFunction";

describe(myFunction, () => {
  // ...
});
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-describe-function-title": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-describe-function-title": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.39.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-describe-function-title.md)
