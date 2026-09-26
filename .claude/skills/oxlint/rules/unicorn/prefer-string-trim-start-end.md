---
title: "unicorn/prefer-string-trim-start-end"
rule: "unicorn/prefer-string-trim-start-end"
category: "Style"
version: "0.0.16"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-string-trim-start-end.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

[`String#trimLeft()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/trimLeft) and [`String#trimRight()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/trimRight) are aliases of [`String#trimStart()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/trimStart) and [`String#trimEnd()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/trimEnd). This is to ensure consistency and use [direction](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Handling_different_text_directions)-independent wording.

### Why is this bad?

The `trimLeft` and `trimRight` names are confusing and inconsistent with the rest of the language.

### Examples

Examples of **incorrect** code for this rule:

```javascript
str.trimLeft();
str.trimRight();
```

Examples of **correct** code for this rule:

```javascript
str.trimStart();
str.trimEnd();
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-string-trim-start-end": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-string-trim-start-end": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-string-trim-start-end.md)
