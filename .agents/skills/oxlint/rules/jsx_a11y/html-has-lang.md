---
title: "jsx-a11y/html-has-lang"
rule: "jsx-a11y/html-has-lang"
category: "Correctness"
version: "0.0.18"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/html-has-lang.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Ensures that every HTML document has a lang attribute.

### Why is this bad?

If the language of a webpage is not specified,
the screen reader assumes the default language set by the user.
Language settings become an issue for users who speak multiple languages
and access website in more than one language.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<html />
```

Examples of **correct** code for this rule:

```jsx
<html lang="en" />
```

## How to use

```json
{
  "rules": {
    "jsx-a11y/html-has-lang": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/html-has-lang": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/html-has-lang.md)
