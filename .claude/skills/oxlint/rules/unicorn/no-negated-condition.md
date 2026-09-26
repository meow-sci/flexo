---
title: "unicorn/no-negated-condition"
rule: "unicorn/no-negated-condition"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-negated-condition.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow negated conditions.

### Why is this bad?

Negated conditions are more difficult to understand. Code can be made more readable by inverting the condition.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (!a) {
  doSomethingC();
} else {
  doSomethingB();
}

!a ? doSomethingC() : doSomethingB();
```

Examples of **correct** code for this rule:

```javascript
if (a) {
  doSomethingB();
} else {
  doSomethingC();
}

a ? doSomethingB() : doSomethingC();
```

## How to use

```json
{
  "rules": {
    "unicorn/no-negated-condition": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-negated-condition": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-negated-condition.md)
