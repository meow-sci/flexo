---
title: "unicorn/text-encoding-identifier-case"
rule: "unicorn/text-encoding-identifier-case"
category: "Style"
version: "0.0.15"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/text-encoding-identifier-case.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule enforces consistent casing for text encoding identifiers, specifically:

- `'utf8'` instead of `'UTF-8'` or `'utf-8'` (or `'utf-8'` if `withDash` is enabled)
- `'ascii'` instead of `'ASCII'`

### Why is this bad?

Inconsistent casing of encoding identifiers reduces code readability and
can lead to subtle confusion across a codebase. Although casing is not
strictly enforced by ECMAScript or Node.js, using lowercase is the
conventional and widely recognized style.

### Examples

Examples of **incorrect** code for this rule:

```javascript
import fs from "node:fs/promises";
async function bad() {
  await fs.readFile(file, "UTF-8");
  await fs.readFile(file, "ASCII");
  const string = buffer.toString("utf-8");
}
```

Examples of **correct** code for this rule:

```javascript
import fs from "node:fs/promises";
async function good() {
  await fs.readFile(file, "utf8");
  await fs.readFile(file, "ascii");
  const string = buffer.toString("utf8");
}
```

Examples of **correct** code for this rule with `{ "withDash": true }`:

```javascript
import fs from "node:fs/promises";
async function good() {
  await fs.readFile(file, "utf-8");
  await fs.readFile(file, "ascii");
  const string = buffer.toString("utf-8");
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### withDash

type: `boolean`

default: `false`

If `true`, prefer `utf-8` over `utf8`.

## How to use

```json
{
  "rules": {
    "unicorn/text-encoding-identifier-case": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/text-encoding-identifier-case": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.15.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/text-encoding-identifier-case.md)
