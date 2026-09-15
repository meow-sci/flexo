---
title: "unicorn/no-invalid-remove-event-listener"
rule: "unicorn/no-invalid-remove-event-listener"
category: "Correctness"
version: "0.0.16"
default: true
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-invalid-remove-event-listener.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

It warns when you use a non-function value as the second argument of `removeEventListener`.

### Why is this bad?

The [`removeEventListener`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/removeEventListener) function must be called with a reference to the same function that was passed to [`addEventListener`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener). Calling `removeEventListener` with an inline function or the result of an inline `.bind()` call is indicative of an error, and won't actually remove the listener.

### Examples

Examples of **incorrect** code for this rule:

```javascript
el.removeEventListener("click", () => {});
el.removeEventListener("click", function () {});
```

Examples of **correct** code for this rule:

```javascript
el.removeEventListener("click", handler);
el.removeEventListener("click", handler.bind(this));
```

## How to use

```json
{
  "rules": {
    "unicorn/no-invalid-remove-event-listener": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-invalid-remove-event-listener": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-invalid-remove-event-listener.md)
