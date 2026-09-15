---
title: "unicorn/escape-case"
rule: "unicorn/escape-case"
category: "Pedantic"
version: "0.0.19"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/escape-case.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces defining escape sequence values with uppercase characters rather than lowercase ones.
This promotes readability by making the escaped value more distinguishable from the identifier.

### Why is this bad?

Using lowercase characters in escape sequences makes them less readable and harder to distinguish
from surrounding code. Most style guides recommend uppercase for consistency and clarity.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = "\xa9";
const foo = "\ud834";
const foo = "\u{1d306}";
const foo = "\ca";
```

Examples of **correct** code for this rule:

```javascript
const foo = "\xA9";
const foo = "\uD834";
const foo = "\u{1D306}";
const foo = "\cA";
```

## How to use

```json
{
  "rules": {
    "unicorn/escape-case": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/escape-case": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/escape-case.md)
