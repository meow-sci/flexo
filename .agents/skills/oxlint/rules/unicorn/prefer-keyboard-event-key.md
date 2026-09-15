---
title: "unicorn/prefer-keyboard-event-key"
rule: "unicorn/prefer-keyboard-event-key"
category: "Style"
version: "1.33.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-keyboard-event-key.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces the use of [`KeyboardEvent#key`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key)
over [`KeyboardEvent#keyCode`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/keyCode),
which is deprecated.

The `.key` property is also more semantic and readable.

### Why is this bad?

The `keyCode`, `which`, and `charCode` properties are deprecated
and should be avoided in favor of the `key` property.

### Examples

Examples of **incorrect** code for this rule:

```js
window.addEventListener("keydown", (event) => {
  if (event.keyCode === 8) {
    console.log("Backspace was pressed");
  }
});

window.addEventListener("keydown", (event) => {
  console.log(event.keyCode);
});
```

Examples of **correct** code for this rule:

```js
window.addEventListener("keydown", (event) => {
  if (event.key === "Backspace") {
    console.log("Backspace was pressed");
  }
});

window.addEventListener("click", (event) => {
  console.log(event.key);
});
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-keyboard-event-key": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-keyboard-event-key": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.33.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-keyboard-event-key.md)
