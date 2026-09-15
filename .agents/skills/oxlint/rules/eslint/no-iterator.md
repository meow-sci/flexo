---
title: "eslint/no-iterator"
rule: "eslint/no-iterator"
category: "Correctness"
version: "0.2.15"
default: true
type_aware: false
fix: "fixable_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-iterator"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallow the use of the `__iterator__` property.

### Why is this bad?

The `__iterator__` property was a SpiderMonkey extension to JavaScript
that could be used to create custom iterators that are compatible with
JavaScript’s for in and for each constructs. However, this property is
now obsolete, so it should not be used. Here’s an example of how this
used to work:

```js
Foo.prototype.__iterator__ = function () {
  return new FooIterator(this);
};
```

### Examples

Examples of **incorrect** code for this rule:

```javascript
Foo.prototype.__iterator__ = function () {
  return new FooIterator(this);
};

foo.__iterator__ = function () {};

foo["__iterator__"] = function () {};
```

Examples of **correct** code for this rule:

```js
const __iterator__ = 42; // not using the __iterator__ property

Foo.prototype[Symbol.iterator] = function () {
  return new FooIterator(this);
};
```

## How to use

```json
{
  "rules": {
    "eslint/no-iterator": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-iterator": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.15.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-iterator)
