---
title: "eslint/no-await-in-loop"
rule: "eslint/no-await-in-loop"
category: "Perf"
version: "0.3.2"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-await-in-loop"
---

| Property | Value |
|----------|-------|
| Category | Perf |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule disallows the use of `await` within loop bodies. (for, for-in, for-of, while, do-while).

### Why is this bad?

It potentially indicates that the async operations are not being effectively parallelized.
Instead, they are being run in series, which can lead to poorer performance.

### Examples

Examples of **incorrect** code for this rule:

```javascript
async function bad() {
  for (const user of users) {
    const userRecord = await getUserRecord(user);
  }
}
```

Examples of **correct** code for this rule:

```javascript
async function good() {
  await Promise.all(users.map((user) => getUserRecord(user)));
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-await-in-loop": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-await-in-loop": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.2.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-await-in-loop)
