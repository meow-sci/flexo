---
title: "unicorn/require-post-message-target-origin"
rule: "unicorn/require-post-message-target-origin"
category: "Suspicious"
version: "0.15.15"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/require-post-message-target-origin.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Enforce using the `targetOrigin` argument with `window.postMessage()`.

Note that this rule may have false positives, as it is not capable of
detecting all cases correctly without type information. As such, it
may not be a good idea to enable in cases where `postMessage()` may
be used with `BroadcastChannel` or worker/service worker contexts
(for example, `WorkerGlobalScope#postMessage`, where the second argument
is a transfer list or options object, not `targetOrigin`).

### Why is this bad?

When calling `window.postMessage()` without the `targetOrigin` argument,
the message cannot be received by any window.

### Examples

Examples of **incorrect** code for this rule:

```js
window.postMessage(message);
```

Examples of **correct** code for this rule:

```js
window.postMessage(message, "https://example.com");

window.postMessage(message, "*");
```

## How to use

```json
{
  "rules": {
    "unicorn/require-post-message-target-origin": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/require-post-message-target-origin": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.15.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/require-post-message-target-origin.md)
