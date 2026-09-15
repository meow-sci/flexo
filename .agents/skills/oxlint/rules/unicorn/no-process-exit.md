---
title: "unicorn/no-process-exit"
rule: "unicorn/no-process-exit"
category: "Restriction"
version: "0.2.9"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-process-exit.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow all usage of `process.exit()`.

### Why is this bad?

`process.exit()` should generally only be used in command-line utilities. In all other
types of applications, the code should throw an error instead.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (problem) {
  process.exit(1);
}
```

Examples of **correct** code for this rule:

```javascript
if (problem) {
  throw new Error("message");
}
```

```
#!/usr/bin/env node
if (problem) {
  process.exit(1);
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-process-exit": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-process-exit": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.9.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-process-exit.md)
