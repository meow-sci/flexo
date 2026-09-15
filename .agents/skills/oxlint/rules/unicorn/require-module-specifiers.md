---
title: "unicorn/require-module-specifiers"
rule: "unicorn/require-module-specifiers"
category: "Suspicious"
version: "1.20.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/require-module-specifiers.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce non-empty specifier list in `import` and `export` statements.

### Why is this bad?

Empty `import`/`export` specifiers add no value and can be confusing.
If you want to import a module for side effects, use `import 'module'` instead.

### Examples

Examples of **incorrect** code for this rule:

```js
import {} from "foo";
import foo from "foo";
export {} from "foo";
export {};
```

Examples of **correct** code for this rule:

```js
import "foo";
import foo from "foo";
```

## How to use

```json
{
  "rules": {
    "unicorn/require-module-specifiers": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/require-module-specifiers": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/require-module-specifiers.md)
