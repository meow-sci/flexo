---
title: "unicorn/prefer-top-level-await"
rule: "unicorn/prefer-top-level-await"
category: "Pedantic"
version: "1.20.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-top-level-await.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Prefer top-level await over top-level promises and async function calls.

### Why is this bad?

Top-level await is more readable and can prevent unhandled rejections.

### Examples

Examples of **incorrect** code for this rule:

```js
(async () => {
  await run();
})();

run().catch((error) => {
  console.error(error);
});
```

Examples of **correct** code for this rule:

```js
await run();

try {
  await run();
} catch (error) {
  console.error(error);
}
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-top-level-await": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-top-level-await": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-top-level-await.md)
