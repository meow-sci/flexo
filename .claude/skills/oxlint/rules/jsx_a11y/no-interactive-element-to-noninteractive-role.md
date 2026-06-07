---
title: "jsx-a11y/no-interactive-element-to-noninteractive-role"
rule: "jsx-a11y/no-interactive-element-to-noninteractive-role"
category: "Correctness"
version: "1.65.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-interactive-element-to-noninteractive-role.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Interactive HTML elements indicate controls in the user interface. Interactive elements include `<a href>`, `<button>`, `<input>`, `<select>`, `<textarea>`.

WAI-ARIA roles should not be used to convert an interactive element to a non-interactive element.
Non-interactive ARIA roles include `article`, `banner`, `complementary`, `img`, `listitem`, `main`, `region` and `tooltip`.

### Why is this bad?

Using a non-interactive role on an interactive element can confuse assistive technology users.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<button role="img">Save</button>
```

Examples of **correct** code for this rule:

```jsx
<div role="img">
  <button>Save</button>
</div>
```

## Configuration

This rule accepts a configuration object with the following properties:

type: `object`

## How to use

```json
{
  "rules": {
    "jsx-a11y/no-interactive-element-to-noninteractive-role": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/no-interactive-element-to-noninteractive-role": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.65.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-interactive-element-to-noninteractive-role.md)
