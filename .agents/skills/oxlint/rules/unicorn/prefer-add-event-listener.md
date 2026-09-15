---
title: "unicorn/prefer-add-event-listener"
rule: "unicorn/prefer-add-event-listener"
category: "Suspicious"
version: "0.0.16"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-add-event-listener.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Enforces the use of `.addEventListener()` and `.removeEventListener()` over their `on`-function counterparts.

For example, `foo.addEventListener('click', handler);` is preferred over `foo.onclick = handler;` for HTML DOM Events.

### Why is this bad?

There are [numerous advantages of using `addEventListener`](https://stackoverflow.com/questions/6348494/addeventlistener-vs-onclick/35093997#35093997). Some of these advantages include registering unlimited event handlers and optionally having the event handler invoked only once.

### Examples

Examples of **incorrect** code for this rule:

```javascript
foo.onclick = () => {};
```

Examples of **correct** code for this rule:

```javascript
foo.addEventListener("click", () => {});
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-add-event-listener": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-add-event-listener": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-add-event-listener.md)
