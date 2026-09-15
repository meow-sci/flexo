---
title: "eslint/no-dupe-else-if"
rule: "eslint/no-dupe-else-if"
category: "Correctness"
version: "0.0.5"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-dupe-else-if"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow duplicate conditions in if-else-if chains.

### Why is this bad?

if-else-if chains are commonly used when there is a need to execute only one branch (or at most one branch) out of several possible branches, based on certain conditions.
Two identical test conditions in the same chain are almost always a mistake in the code. Unless there are side effects in the expressions,
a duplicate will evaluate to the same true or false value as the identical expression earlier in the chain, meaning that its branch can never execute.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (a) {
  foo();
} else if (b) {
  bar();
} else if (b) {
  baz();
}
```

```javascript
if (a || b) {
  foo();
} else if (a) {
  bar();
}
```

```javascript
if (n === 1) {
  foo();
} else if (n === 2) {
  bar();
} else if (n === 3) {
  baz();
} else if (n === 2) {
  quux();
} else if (n === 5) {
  quuux();
}
```

Examples of **correct** code for this rule:

```javascript
if (a) {
  foo();
} else if (b) {
  bar();
} else if (c) {
  baz();
}
```

```javascript
if (a || b) {
  foo();
} else if (c) {
  bar();
}
```

```javascript
if (n === 1) {
  foo();
} else if (n === 2) {
  bar();
} else if (n === 3) {
  baz();
} else if (n === 4) {
  quux();
} else if (n === 5) {
  quuux();
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-dupe-else-if": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-dupe-else-if": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.5.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-dupe-else-if)
