---
title: "jsx-a11y/no-distracting-elements"
rule: "jsx-a11y/no-distracting-elements"
category: "Correctness"
version: "0.0.22"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-distracting-elements.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces that no distracting elements are used.

### Why is this bad?

Elements that can be visually distracting can cause accessibility issues
with visually impaired users. Such elements are most likely deprecated,
and should be avoided. By default, `<marquee>` and `<blink>` elements
are visually distracting and can trigger vestibular disorders.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<marquee />
<marquee {...props} />
<marquee lang={undefined} />
<blink />
<blink {...props} />
<blink foo={undefined} />
```

Examples of **correct** code for this rule:

```jsx
<div />
<Marquee />
<Blink />
```

## Configuration

This rule accepts a configuration object with the following properties:

### elements

type: `array`

List of distracting elements to check for.

#### elements[n]

type: `"marquee" | "blink"`

## How to use

```json
{
  "rules": {
    "jsx-a11y/no-distracting-elements": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/no-distracting-elements": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.22.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/no-distracting-elements.md)
