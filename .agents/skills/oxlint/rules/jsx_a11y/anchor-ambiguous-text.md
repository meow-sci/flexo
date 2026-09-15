---
title: "jsx-a11y/anchor-ambiguous-text"
rule: "jsx-a11y/anchor-ambiguous-text"
category: "Restriction"
version: "0.13.2"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/anchor-ambiguous-text.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Inspects anchor link text for the use of ambiguous words.

This rule checks the text from the anchor element `aria-label` if available.
In absence of an anchor `aria-label` it combines the following text of it's children:

- `aria-label` if available
- if the child is an image, the `alt` text
- the text content of the HTML element

### Why is this bad?

Screen readers users rely on link text for context, ambiguous words such as "click here" do
not provide enough context.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<a>link</a>
<a>click here</a>
```

Examples of **correct** code for this rule:

```jsx
<a>read this tutorial</a>
<a aria-label="oxc linter documentation">click here</a>
```

## Configuration

This rule accepts a configuration object with the following properties:

### words

type: `string[]`

default: `["click here", "here", "link", "a link", "learn more"]`

List of ambiguous words or phrases that should be flagged in anchor text.

## How to use

```json
{
  "rules": {
    "jsx-a11y/anchor-ambiguous-text": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/anchor-ambiguous-text": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.13.2.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/anchor-ambiguous-text.md)
