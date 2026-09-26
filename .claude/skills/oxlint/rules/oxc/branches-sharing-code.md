---
title: "oxc/branches-sharing-code"
rule: "oxc/branches-sharing-code"
category: "Pedantic"
version: "1.22.0"
default: false
type_aware: false
fix: "fixable_suggestion"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Checks if the `if` and `else` blocks contain shared code that can be moved out of the blocks.

### Why is this bad?

Duplicate code is less maintainable. Extracting common code from branches makes the code more DRY (Don't Repeat Yourself)
and easier to maintain.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (condition) {
  console.log("Hello");
  return 13;
} else {
  console.log("Hello");
  return 42;
}

if (condition) {
  doSomething();
  cleanup();
} else {
  doSomethingElse();
  cleanup();
}
```

Examples of **correct** code for this rule:

```javascript
console.log("Hello");
if (condition) {
  return 13;
} else {
  return 42;
}

if (condition) {
  doSomething();
} else {
  doSomethingElse();
}
cleanup();
```

## How to use

```json
{
  "rules": {
    "oxc/branches-sharing-code": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "oxc/branches-sharing-code": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.22.0.

## References

