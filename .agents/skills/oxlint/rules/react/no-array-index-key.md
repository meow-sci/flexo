---
title: "react/no-array-index-key"
rule: "react/no-array-index-key"
category: "Perf"
version: "0.13.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-array-index-key.md"
---

| Property | Value |
|----------|-------|
| Category | Perf |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Warn if an element uses an Array index in its key.

### Why is this bad?

It's a bad idea to use the array index since it doesn't uniquely identify your elements.
In cases where the array is sorted or an element is added to the beginning of the array,
the index will be changed even though the element representing that index may be the same.
This results in unnecessary renders.

### Examples

Examples of **incorrect** code for this rule:

```jsx
things.map((thing, index) => <Hello key={index} />);
```

Examples of **correct** code for this rule:

```jsx
things.map((thing, index) => <Hello key={thing.id} />);
```

## How to use

```json
{
  "rules": {
    "react/no-array-index-key": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-array-index-key": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.13.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-array-index-key.md)
