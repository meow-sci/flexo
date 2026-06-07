---
title: "jsx-a11y/media-has-caption"
rule: "jsx-a11y/media-has-caption"
category: "Correctness"
version: "0.1.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/media-has-caption.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Checks if `<audio>` and `<video>` elements have a `<track>` element for captions.
This ensures media content is accessible to all users, including those with hearing impairments.

### Why is this bad?

Without captions, audio and video content is not accessible to users who are deaf or hard of hearing.
Captions are also useful for users in noisy environments or where audio is not available.

### Examples

Examples of **incorrect** code for this rule:

```jsx
<audio></audio>
<video></video>
```

Examples of **correct** code for this rule:

```jsx
<audio><track kind="captions" src="caption_file.vtt" /></audio>
<video><track kind="captions" src="caption_file.vtt" /></video>
```

## Configuration

This rule accepts a configuration object with the following properties:

### audio

type: `string[]`

default: `["audio"]`

Element names to treat as `<audio>` elements

### track

type: `string[]`

default: `["track"]`

Element names to treat as `<track>` elements

### video

type: `string[]`

default: `["video"]`

Element names to treat as `<video>` elements

## How to use

```json
{
  "rules": {
    "jsx-a11y/media-has-caption": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsx-a11y/media-has-caption": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

- [Upstream rule documentation](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/main/docs/rules/media-has-caption.md)
