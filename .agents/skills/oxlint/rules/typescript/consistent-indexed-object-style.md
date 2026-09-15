---
title: "typescript/consistent-indexed-object-style"
rule: "typescript/consistent-indexed-object-style"
category: "Style"
version: "0.4.2"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://typescript-eslint.io/rules/consistent-indexed-object-style/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Choose between requiring either `Record` type or indexed signature types.

These two types are equivalent, this rule enforces consistency in picking one style over the other:

```ts
type Foo = Record<string, unknown>;

type Foo = {
  [key: string]: unknown;
};
```

### Why is this bad?

Inconsistent style for indexed object types can harm readability in a project.

### Examples

Examples of **incorrect** code for this rule with
`consistent-indexed-object-style: ["error", "record"]` (default):

```ts
interface Foo {
  [key: string]: unknown;
}
type Foo = {
  [key: string]: unknown;
};
```

Examples of **correct** code for this rule with
`consistent-indexed-object-style: ["error", "record"]` (default):

```ts
type Foo = Record<string, unknown>;
```

Examples of **incorrect** code for this rule with
`consistent-indexed-object-style: ["error", "index-signature"]`:

```ts
type Foo = Record<string, unknown>;
```

Examples of **correct** code for this rule with
`consistent-indexed-object-style: ["error", "index-signature"]`:

```ts
interface Foo {
  [key: string]: unknown;
}
type Foo = {
  [key: string]: unknown;
};
```

## Configuration

This rule accepts one of the following string values:

### `"record"`

When set to `record`, enforces the use of a `Record` for indexed object types, e.g. `Record<string, unknown>`.

### `"index-signature"`

When set to `index-signature`, enforces the use of indexed signature types, e.g. `{ [key: string]: unknown }`.

## How to use

```json
{
  "rules": {
    "typescript/consistent-indexed-object-style": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/consistent-indexed-object-style": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.2.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/consistent-indexed-object-style/)
