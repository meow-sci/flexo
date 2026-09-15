---
title: "unicorn/require-module-attributes"
rule: "unicorn/require-module-attributes"
category: "Style"
version: "1.35.0"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/require-module-attributes.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

This rule enforces non-empty attribute list in `import`/`export` statements and `import()` expressions.

### Why is this bad?

Import attributes are meant to provide metadata about how a module should be loaded
(e.g., `with { type: "json" }`). An empty attribute object provides no information
and should be removed.

### Examples

Examples of **incorrect** code for this rule:

```js
import foo from "foo" with {};

export { foo } from "foo" with {};

const foo = await import("foo", {});

const foo = await import("foo", { with: {} });
```

Examples of **correct** code for this rule:

```js
import foo from "foo";

export { foo } from "foo";

const foo = await import("foo");

const foo = await import("foo");
```

## How to use

```json
{
  "rules": {
    "unicorn/require-module-attributes": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/require-module-attributes": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.35.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/require-module-attributes.md)
