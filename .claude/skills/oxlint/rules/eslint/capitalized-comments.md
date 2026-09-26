---
title: "eslint/capitalized-comments"
rule: "eslint/capitalized-comments"
category: "Style"
version: "1.34.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/capitalized-comments"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces or disallows capitalization of the first letter of a comment.

### Why is this bad?

Inconsistent capitalization of comments can make code harder to read.
This rule helps enforce a consistent style across the codebase.

### Examples

Examples of **incorrect** code for this rule with the default `"always"` option:

```js
// lowercase comment
/* lowercase block comment */
```

Examples of **correct** code for this rule with the default `"always"` option:

```js
// Capitalized comment
/* Capitalized block comment */
// 123 - comments starting with non-letters are ignored
```

## Configuration

Configuration for the capitalized-comments rule.

The first element specifies whether comments should `"always"` or `"never"`
begin with a capital letter. The second element is an optional object
containing additional options.

### The 1st option

type: `"always" | "never"`

### The 2nd option

This option is an object with the following properties:

#### block

type: `object`

Configuration options specific to block comments.

##### block.ignoreConsecutiveComments

type: `boolean`

If true, consecutive comments will be ignored after the first comment.

##### block.ignoreInlineComments

type: `boolean`

If true, inline comments (comments in the middle of code) will be ignored.

##### block.ignorePattern

type: `string`

A regex pattern. Comments that match the pattern will not cause violations.

#### ignoreConsecutiveComments

type: `boolean`

If true, consecutive comments will be ignored after the first comment.

#### ignoreInlineComments

type: `boolean`

If true, inline comments (comments in the middle of code) will be ignored.

#### ignorePattern

type: `string`

A regex pattern. Comments that match the pattern will not cause violations.

#### line

type: `object`

Configuration options specific to line comments.

##### line.ignoreConsecutiveComments

type: `boolean`

If true, consecutive comments will be ignored after the first comment.

##### line.ignoreInlineComments

type: `boolean`

If true, inline comments (comments in the middle of code) will be ignored.

##### line.ignorePattern

type: `string`

A regex pattern. Comments that match the pattern will not cause violations.

## How to use

```json
{
  "rules": {
    "eslint/capitalized-comments": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/capitalized-comments": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.34.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/capitalized-comments)
