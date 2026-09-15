---
title: "unicorn/prefer-import-meta-properties"
rule: "unicorn/prefer-import-meta-properties"
category: "Pedantic"
version: "1.59.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-import-meta-properties.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefer `import.meta.{dirname,filename}` over legacy
techniques for getting file paths.

### Why is this bad?

Starting with Node.js 20.11, `import.meta.dirname` and `import.meta.filename`
have been introduced in ES modules.
`import.meta.filename` is equivalent to `url.fileURLToPath(import.meta.url)`.
`import.meta.dirname` is equivalent to `path.dirname(import.meta.filename)`.
This rule replaces legacy patterns with `import.meta.dirname` and `import.meta.filename`.

### Examples

Examples of **incorrect** code for this rule:

```js
import path from "node:path";
import { fileURLToPath } from "url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const dirname = path.dirname(import.meta.filename);
const dirname = fileURLToPath(new URL(".", import.meta.url));
```

Examples of **correct** code for this rule:

```js
const filename = import.meta.filename;
const dirname = import.meta.dirname;
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-import-meta-properties": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-import-meta-properties": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.59.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-import-meta-properties.md)
