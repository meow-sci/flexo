---
title: "jsx-a11y/no-noninteractive-element-interactions"
rule: "jsx-a11y/no-noninteractive-element-interactions"
category: "Correctness"
version: "1.65.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-noninteractive-element-interactions.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents non-interactive HTML elements and elements with non-interactive ARIA roles from
being assigned mouse or keyboard event handlers.

### Why is this bad?

Non-interactive elements such as `<main>`, `<h1>`, `<p>`, `<img>`, `<li>`, `<ul>`, and
`<ol>` represent content or containers. Adding interaction handlers to them can make the
UI difficult or impossible to operate with assistive technology.

Move the handler to an interactive element, such as `<button>` or `<a href>`, or use an
element with an appropriate interactive role and keyboard behavior.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<li onClick={() => {}} />
<div role="listitem" onKeyDown={() => {}} />
```

Examples of **correct** code for this rule:

```jsx
<button onClick={() => {}} />
<div role="button" onClick={() => {}} />
<div onClick={() => {}} role="presentation" />
```

## Configuration

This rule accepts a configuration object with the following properties:

### handlers

type: `string[]`

default: `null`

An array of event handler names that should trigger this rule.

## How to use

```json
{
  "rules": {
    "jsx-a11y/no-noninteractive-element-interactions": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/no-noninteractive-element-interactions": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.65.0.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-noninteractive-element-interactions.md)
