---
title: "eslint/max-lines"
rule: "eslint/max-lines"
category: "Pedantic"
version: "0.2.14"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/max-lines"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce a maximum number of lines per file.

### Why is this bad?

Some people consider large files a code smell. Large files tend to do a
lot of things and can make it hard following what’s going. While there
is not an objective maximum number of lines considered acceptable in a
file, most people would agree it should not be in the thousands.
Recommendations usually range from 100 to 500 lines.

## Configuration

This rule accepts a configuration object with the following properties:

### max

type: `integer`

default: `300`

Maximum number of lines allowed per file.

### skipBlankLines

type: `boolean`

default: `false`

Whether to ignore blank lines when counting.

### skipComments

type: `boolean`

default: `false`

Whether to ignore comments when counting.

## How to use

```json
{
  "rules": {
    "eslint/max-lines": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/max-lines": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/max-lines)
