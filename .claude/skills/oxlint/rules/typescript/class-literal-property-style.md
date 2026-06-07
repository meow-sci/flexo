---
title: "typescript/class-literal-property-style"
rule: "typescript/class-literal-property-style"
category: "Style"
version: "1.47.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://typescript-eslint.io/rules/class-literal-property-style/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Enforces a consistent style for exposing literal values on classes.

### Why is this bad?

Mixing readonly fields and trivial literal getters for the same kind of value
makes class APIs inconsistent and harder to scan.

### Examples

Examples of **incorrect** code for this rule (default `"fields"`):

```ts
class C {
  get name() {
    return "oxc";
  }
}
```

Examples of **correct** code for this rule:

```ts
class C {
  readonly name = "oxc";
}
```

## Configuration

This rule accepts one of the following string values:

### `"fields"`

Enforce using readonly fields for literal values.

Examples of **incorrect** code with this option:

```ts
class C {
  get name() {
    return "oxc";
  }
}
```

Examples of **correct** code with this option:

```ts
class C {
  readonly name = "oxc";
}
```

### `"getters"`

Enforce using getters for literal values.

Examples of **incorrect** code with this option:

```ts
class C {
  readonly name = "oxc";
}
```

Examples of **correct** code with this option:

```ts
class C {
  get name() {
    return "oxc";
  }
}
```

## How to use

```json
{
  "rules": {
    "typescript/class-literal-property-style": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/class-literal-property-style": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.47.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/class-literal-property-style/)
