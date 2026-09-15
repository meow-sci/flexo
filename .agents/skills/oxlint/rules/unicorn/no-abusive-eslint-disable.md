---
title: "unicorn/no-abusive-eslint-disable"
rule: "unicorn/no-abusive-eslint-disable"
category: "Restriction"
version: "0.0.18"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-abusive-eslint-disable.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows `oxlint-disable` or `eslint-disable` comments without specifying rules.

### Why is this bad?

A general `oxlint-disable` or `eslint-disable` comment suppresses all lint errors, not just the intended one,
potentially hiding useful warnings and making debugging harder.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/* eslint-disable */
console.log(message);

console.log(message); // eslint-disable-line

// eslint-disable-next-line
console.log(message);
```

```javascript
/* oxlint-disable */
console.log(message);

console.log(message); // oxlint-disable-line

// oxlint-disable-next-line
console.log(message);
```

Examples of **correct** code for this rule:

```javascript
/* eslint-disable no-console */
console.log(message);

console.log(message); // eslint-disable-line no-console

// eslint-disable-next-line no-console
console.log(message);
```

```javascript
/* oxlint-disable no-console */
console.log(message);

console.log(message); // oxlint-disable-line no-console

// oxlint-disable-next-line no-console
console.log(message);
```

## How to use

```json
{
  "rules": {
    "unicorn/no-abusive-eslint-disable": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-abusive-eslint-disable": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-abusive-eslint-disable.md)
