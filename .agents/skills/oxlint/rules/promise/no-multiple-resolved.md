---
title: "promise/no-multiple-resolved"
rule: "promise/no-multiple-resolved"
category: "Suspicious"
version: "1.19.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-multiple-resolved.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule warns of paths that resolve multiple times in executor functions that Promise constructors.

### Why is this bad?

Multiple resolve/reject calls:

- Violate the Promise/A+ specification
- Have no effect on the Promise's behavior
- Make the code's intent unclear
- May indicate logical errors in the implementation

### Examples

Examples of **incorrect** code for this rule:

```javascript
new Promise((resolve, reject) => {
  fn((error, value) => {
    if (error) {
      reject(error);
    }

    resolve(value); // Both `reject` and `resolve` may be called.
  });
});
```

Examples of **correct** code for this rule:

```javascript
new Promise((resolve, reject) => {
  fn((error, value) => {
    if (error) {
      reject(error);
    } else {
      resolve(value);
    }
  });
});
```

## How to use

```json
{
  "rules": {
    "promise/no-multiple-resolved": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/no-multiple-resolved": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.19.0.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-multiple-resolved.md)
