---
title: "eslint/no-useless-constructor"
rule: "eslint/no-useless-constructor"
category: "Suspicious"
version: "0.4.4"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-useless-constructor"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallow constructors that can be safely removed without changing how the class works.

### Why is this bad?

ES2015 provides a default class constructor if one is not specified. As
such, it is unnecessary to provide an empty constructor or one that
simply delegates into its parent class.

> **Warning:** Caveat: This lint rule will report on constructors whose sole purpose
> is to change the visibility of a parent constructor, or to expose parameter
> properties with modifiers. This is because the rule does not have type
> information to determine if the parent constructor is `public`, `protected`,
> or `private`.


### Examples

Examples of **incorrect** code for this rule:

```javascript
class A {
  constructor() {}
}

class B extends A {
  constructor(...args) {
    super(...args);
  }
}
```

Examples of **correct** code for this rule:

```javascript
class A {}

class B {
  constructor() {
    doSomething();
  }
}

class C extends A {
  constructor() {
    super("foo");
  }
}

class D extends A {
  constructor() {
    super();
    doSomething();
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-useless-constructor": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-useless-constructor": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-useless-constructor)
