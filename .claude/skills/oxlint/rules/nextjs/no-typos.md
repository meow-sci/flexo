---
title: "nextjs/no-typos"
rule: "nextjs/no-typos"
category: "Correctness"
version: "0.2.1"
default: false
type_aware: false
fix: "pending"
upstream: "https://nextjs.org/docs/messages/no-typos"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Detects common typos in Next.js data fetching function names.

### Why is this bad?

Next.js will not call incorrectly named data fetching functions, causing pages to render without expected data.

### Examples

Examples of **incorrect** code for this rule:

```javascript
export default function Page() {
  return <div></div>;
}
export async function getServurSideProps() {}
```

Examples of **correct** code for this rule:

```javascript
export default function Page() {
  return <div></div>;
}
export async function getServerSideProps() {}
```

## How to use

```json
{
  "rules": {
    "nextjs/no-typos": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-typos": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.1.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-typos)
