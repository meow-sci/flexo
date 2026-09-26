---
title: "vitest/consistent-test-filename"
rule: "vitest/consistent-test-filename"
category: "Style"
version: "1.36.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/consistent-test-filename.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule triggers an error when a file is considered a test file, but its name
does not match an expected filename format.

### Why is this bad?

Files that are tests but with an unexpected filename make it hard to distinguish between
source code files and test files.

### Examples

An example of an **incorrect** file path for this rule configured as `{"allTestPattern": "__tests__",  "pattern": ".*\.spec\.ts$"}`:

`__tests__/2.ts`

An example of a **correct** file path for this rule configured as `{"allTestPattern": "__tests__",  "pattern": ".*\.spec\.ts$"}`:

`__tests__/2.spec.ts`

## Configuration

This rule accepts a configuration object with the following properties:

### allTestPattern

type: `string`

Regex pattern to ensure we are linting only test filenames.
Decides whether a file is a testing file.

### pattern

type: `string`

Required regex to check if a test filename have a valid formart.
Pattern doesn't have a default value, you must provide one.

## How to use

```json
{
  "rules": {
    "vitest/consistent-test-filename": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/consistent-test-filename": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.36.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/consistent-test-filename.md)
