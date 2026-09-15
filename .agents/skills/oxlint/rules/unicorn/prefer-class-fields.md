---
title: "unicorn/prefer-class-fields"
rule: "unicorn/prefer-class-fields"
category: "Style"
version: "1.20.0"
default: false
type_aware: false
fix: "conditional_safe_fix_or_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-class-fields.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | conditional_safe_fix_or_suggestion |
| Type-aware | no |


### What it does

Prefers class field declarations over `this` assignments in constructors for static values.

### Why is this bad?

Class field declarations are more readable and less error-prone than assigning static
values to `this` in the constructor. Using class fields keeps the constructor cleaner
and makes the intent clearer.

### Examples

Examples of **incorrect** code for this rule:

```ts
class Foo {
  constructor() {
    this.bar = 1;
  }
}

class MyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MyError";
  }
}

class Foo {
  foo = "foo";
  constructor() {
    this.foo = "bar";
  }
}
```

Examples of **correct** code for this rule:

```js
class Foo {
  bar = 1;
}

class MyError extends Error {
  name = "MyError";
}

class Foo {
  foo = "bar";
}
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-class-fields": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-class-fields": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-class-fields.md)
