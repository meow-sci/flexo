---
title: "jsx-a11y/img-redundant-alt"
rule: "jsx-a11y/img-redundant-alt"
category: "Correctness"
version: "0.0.19"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/img-redundant-alt.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce that `img` alt attributes do not contain redundant words like
"image", "picture", or "photo".

### Why is this bad?

Screen readers already announce `img` elements as an image, so there is
no need to use words such as "image", "photo", or "picture" in the alt
text. This creates redundant information for users of assistive
technologies and makes the alt text less concise and useful.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<img src="foo" alt="Photo of foo being weird." />
<img src="bar" alt="Image of me at a bar!" />
<img src="baz" alt="Picture of baz fixing a bug." />
```

Examples of **correct** code for this rule:

```jsx
<img src="foo" alt="Foo eating a sandwich." />
<img src="bar" aria-hidden alt="Picture of me taking a photo of an image" /> // Will pass because it is hidden.
<img src="baz" alt={`Baz taking a ${photo}`} /> // This is valid since photo is a variable name.
```

## Configuration

This rule accepts a configuration object with the following properties:

### components

type: `string[]`

default: `["img"]`

JSX element types to validate (component names) where the rule applies.
For example, `["img", "Image"]`.

### words

type: `string[]`

default: `["image", "photo", "picture"]`

Words considered redundant in alt text that should trigger a warning.

## How to use

```json
{
  "rules": {
    "jsx-a11y/img-redundant-alt": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/img-redundant-alt": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/img-redundant-alt.md)
