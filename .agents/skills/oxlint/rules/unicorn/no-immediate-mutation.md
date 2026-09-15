---
title: "unicorn/no-immediate-mutation"
rule: "unicorn/no-immediate-mutation"
category: "Pedantic"
version: "1.35.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-immediate-mutation.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallows mutating a variable immediately after initialization.

### Why is this bad?

When you initialize a variable and immediately mutate it, it's cleaner to include
the mutation in the initialization. This makes the code more readable and reduces
the number of statements.

### Examples

Examples of **incorrect** code for this rule:

```js
const array = [1, 2];
array.push(3);

const object = { foo: 1 };
object.bar = 2;

const set = new Set([1, 2]);
set.add(3);

const map = new Map([["foo", 1]]);
map.set("bar", 2);
```

Examples of **correct** code for this rule:

```js
const array = [1, 2, 3];

const object = { foo: 1, bar: 2 };

const set = new Set([1, 2, 3]);

const map = new Map([
  ["foo", 1],
  ["bar", 2],
]);
```

## How to use

```json
{
  "rules": {
    "unicorn/no-immediate-mutation": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-immediate-mutation": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.35.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-immediate-mutation.md)
