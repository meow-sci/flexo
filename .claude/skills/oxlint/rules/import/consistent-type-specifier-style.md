---
title: "import/consistent-type-specifier-style"
rule: "import/consistent-type-specifier-style"
category: "Style"
version: "0.16.11"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/consistent-type-specifier-style.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

This rule either enforces or bans the use of inline type-only markers for named imports.

### Why is this bad?

Mixing top-level `import type { Foo } from 'foo'` with inline `{ type Bar }`
forces readers to mentally switch contexts when scanning your imports.
Enforcing one style makes it immediately obvious which imports are types and which are value imports.

### Examples

Examples of incorrect code for the default `prefer-top-level` option:

```typescript
import { type Foo } from "Foo";
import Foo, { type Bar } from "Foo";
```

Examples of correct code for the default option:

```typescript
import type { Foo } from "Foo";
import type Foo, { Bar } from "Foo";
```

Examples of incorrect code for the `prefer-inline` option:

```typescript
import type { Foo } from "Foo";
import type Foo, { Bar } from "Foo";
```

Examples of correct code for the `prefer-inline` option:

```typescript
import { type Foo } from "Foo";
import Foo, { type Bar } from "Foo";
```

## Configuration

This rule accepts one of the following string values:

### `"prefer-top-level"`

Prefer `import type { Foo } from 'foo'` for type imports.

### `"prefer-inline"`

Prefer `import { type Foo } from 'foo'` for type imports.

## How to use

```json
{
  "rules": {
    "import/consistent-type-specifier-style": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/consistent-type-specifier-style": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.11.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/consistent-type-specifier-style.md)
