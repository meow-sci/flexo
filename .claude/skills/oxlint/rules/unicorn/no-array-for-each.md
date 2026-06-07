---
title: "unicorn/no-array-for-each"
rule: "unicorn/no-array-for-each"
category: "Restriction"
version: "0.0.19"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-for-each.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Forbids the use of `Array#forEach` in favor of a for loop.

### Why is this bad?

Benefits of [`for…of` statement](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...of) over the `forEach` method can include:

- Faster
- Better readability
- Ability to exit early with `break` or `return`

Additionally, using `for…of` has great benefits if you are using TypeScript, because it does not cause a function boundary to be crossed. This means that type-narrowing earlier on in the current scope will work properly while inside of the loop (without having to re-type-narrow). Furthermore, any mutated variables inside of the loop will picked up on for the purposes of determining if a variable is being used.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = [1, 2, 3];
foo.forEach((element) => {
  /* ... */
});
```

Examples of **correct** code for this rule:

```javascript
const foo = [1, 2, 3];
for (const element of foo) {
  /* ... */
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-array-for-each": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-array-for-each": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-for-each.md)
