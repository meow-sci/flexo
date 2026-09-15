---
title: "nextjs/inline-script-id"
rule: "nextjs/inline-script-id"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/inline-script-id"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces that all `next/script` components with inline content or `dangerouslySetInnerHTML` must have an `id` prop.

### Why is this bad?

Next.js requires a unique `id` prop for inline scripts to properly deduplicate them during page renders.
Without an `id`, the same inline script might be executed multiple times, leading to unexpected behavior
or performance issues. This is particularly important for scripts that modify global state or perform
one-time initializations.

### Examples

Examples of **incorrect** code for this rule:

```javascript
import Script from 'next/script';

export default function Page() {
  return (
    <Script>
      {`console.log('Hello world');`}
    </Script>
  );
}

// Also incorrect with dangerouslySetInnerHTML
export default function Page() {
  return (
    <Script
      dangerouslySetInnerHTML={{
        __html: `console.log('Hello world');`
      }}
    />
  );
}
```

Examples of **correct** code for this rule:

```javascript
import Script from 'next/script';

export default function Page() {
  return (
    <Script id="my-script">
      {`console.log('Hello world');`}
    </Script>
  );
}

// Correct with dangerouslySetInnerHTML
export default function Page() {
  return (
    <Script
      id="my-script"
      dangerouslySetInnerHTML={{
        __html: `console.log('Hello world');`
      }}
    />
  );
}

// No id required for external scripts
export default function Page() {
  return (
    <Script src="https://example.com/script.js" />
  );
}
```

## How to use

```json
{
  "rules": {
    "nextjs/inline-script-id": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/inline-script-id": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/inline-script-id)
