---
title: "unicorn/prefer-event-target"
rule: "unicorn/prefer-event-target"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-event-target.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prefers `EventTarget` over `EventEmitter`.

This rule reduces the bundle size and makes your code more cross-platform friendly.

See the [differences](https://nodejs.org/api/events.html#eventtarget-and-event-api) between `EventEmitter` and `EventTarget`.

### Why is this bad?

While [`EventEmitter`](https://nodejs.org/api/events.html#class-eventemitter) is only available in Node.js, [`EventTarget`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) is also available in _Deno_ and browsers.

### Examples

Examples of **incorrect** code for this rule:

```javascript
class Foo extends EventEmitter {}
```

Examples of **correct** code for this rule:

```javascript
class Foo extends OtherClass {}
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-event-target": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-event-target": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-event-target.md)
