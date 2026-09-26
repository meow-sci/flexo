---
title: "unicorn/switch-case-braces"
rule: "unicorn/switch-case-braces"
category: "Style"
version: "0.0.15"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/switch-case-braces.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Requires empty switch cases to omit braces, while non-empty cases must use braces.
This reduces visual clutter for empty cases and enforces proper scoping for non-empty ones.

### Why is this bad?

Using braces unnecessarily for empty cases adds visual noise,
while omitting braces in non-empty cases can lead to scoping issues.

### Examples

Examples of **incorrect** code for this rule:

```javascript
switch (num) {
  case 1: {
  }
  case 2:
    console.log("Case 2");
    break;
}
```

Examples of **correct** code for this rule:

```javascript
switch (num) {
  case 1:
  case 2: {
    console.log("Case 2");
    break;
  }
}
```

Example config:

```json
"unicorn/switch-case-braces": ["error", "avoid"]
```

## Configuration

This rule accepts one of the following string values:

### `"always"`

Always require braces in case clauses (except empty cases).

### `"avoid"`

Allow braces only when needed for scoping (e.g., variable or function declarations).

## How to use

```json
{
  "rules": {
    "unicorn/switch-case-braces": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/switch-case-braces": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.15.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/switch-case-braces.md)
