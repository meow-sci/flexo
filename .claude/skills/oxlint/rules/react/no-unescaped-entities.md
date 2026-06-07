---
title: "react/no-unescaped-entities"
rule: "react/no-unescaped-entities"
category: "Pedantic"
version: "0.0.15"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-unescaped-entities.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

This rule prevents characters that you may have meant as JSX escape characters from being accidentally injected as a text node in JSX statements.

### Why is this bad?

JSX escape characters are used to inject characters into JSX statements that would otherwise be interpreted as code.

### Example

Incorrect

```jsx
<div> > </div>
```

Correct

```jsx
<div> &gt; </div>
```

```jsx
<div> {">"} </div>
```

## How to use

```json
{
  "rules": {
    "react/no-unescaped-entities": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "react/no-unescaped-entities": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.15.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-unescaped-entities.md)
