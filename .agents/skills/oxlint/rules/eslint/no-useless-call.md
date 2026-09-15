---
title: "eslint/no-useless-call"
rule: "eslint/no-useless-call"
category: "Perf"
version: "0.15.9"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-useless-call"
---

| Property | Value |
|----------|-------|
| Category | Perf |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow unnecessary calls to `.call()` and `.apply()`

### Why is this bad?

`Function.prototype.call()` and `Function.prototype.apply()` are slower than the normal function invocation.

This rule compares code statically to check whether or not thisArg is changed.
So if the code about thisArg is a dynamic expression, this rule cannot judge correctly.

### Examples

Examples of **incorrect** code for this rule:

```js
// These are the same as `foo(1, 2, 3);`
foo.call(undefined, 1, 2, 3);
foo.apply(undefined, [1, 2, 3]);
foo.call(null, 1, 2, 3);
foo.apply(null, [1, 2, 3]);

// These are the same as `obj.foo(1, 2, 3);`
obj.foo.call(obj, 1, 2, 3);
obj.foo.apply(obj, [1, 2, 3]);
```

Examples of **correct** code for this rule:

```js
// The `this` binding is different.
foo.call(obj, 1, 2, 3);
foo.apply(obj, [1, 2, 3]);
obj.foo.call(null, 1, 2, 3);
obj.foo.apply(null, [1, 2, 3]);
obj.foo.call(otherObj, 1, 2, 3);
obj.foo.apply(otherObj, [1, 2, 3]);

// The argument list is variadic.
// Those are warned by the `prefer-spread` rule.
foo.apply(undefined, args);
foo.apply(null, args);
obj.foo.apply(obj, args);
```

## How to use

```json
{
  "rules": {
    "eslint/no-useless-call": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-useless-call": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.9.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-useless-call)
