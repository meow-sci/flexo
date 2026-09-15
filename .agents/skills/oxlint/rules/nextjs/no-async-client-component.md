---
title: "nextjs/no-async-client-component"
rule: "nextjs/no-async-client-component"
category: "Correctness"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://nextjs.org/docs/messages/no-async-client-component"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents the use of async functions for client components in Next.js applications.
This rule checks for any async function that:

- Is marked with "use client" directive
- Has a name starting with an uppercase letter (indicating it's a component)
- Is either exported as default or assigned to a variable

### Why is this bad?

Using async functions for client components can cause hydration mismatches between server and client,
can break component rendering lifecycle, and can lead to unexpected behavior with React's concurrent features.

### Examples

Examples of **incorrect** code for this rule:

```javascript
"use client"

// Async component with default export
export default async function MyComponent() {
  return <></>
}

// Async component with named export
async function MyComponent() {
  return <></>
}
export default MyComponent

// Async arrow function component
const MyComponent = async () => {
  return <></>
}
export default MyComponent
```

Examples of **correct** code for this rule:

```javascript
"use client"

// Regular synchronous component
export default function MyComponent() {
  return <></>
}

// Handling async operations in effects
export default function MyComponent() {
  useEffect(() => {
    async function fetchData() {
      // async operations here
    }
    fetchData();
  }, []);
  return <></>
}

// Async operations in event handlers
export default function MyComponent() {
  const handleClick = async () => {
    // async operations here
  }
  return <button onClick={handleClick}>Click me</button>
}
```

## How to use

```json
{
  "rules": {
    "nextjs/no-async-client-component": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "nextjs/no-async-client-component": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://nextjs.org/docs/messages/no-async-client-component)
