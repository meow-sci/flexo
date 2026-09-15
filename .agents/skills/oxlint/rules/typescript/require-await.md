---
title: "typescript/require-await"
rule: "typescript/require-await"
category: "Pedantic"
version: "1.12.0"
default: false
type_aware: true
fix: "fixable_suggestion"
upstream: "https://typescript-eslint.io/rules/require-await/"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | yes |


### What it does

This rule disallows async functions which do not have an await expression.

### Why is this bad?

Async functions that don't use await are usually a mistake. They return a Promise unnecessarily and can often be converted to regular functions. This can improve performance and make the code clearer.

### Examples

Examples of **incorrect** code for this rule:

```ts
// Async function without await
async function fetchData() {
  return fetch("/api/data");
}

// Async arrow function without await
const processData = async () => {
  return someData.map((x) => x * 2);
};

// Async method without await
class DataService {
  async getData() {
    return this.data;
  }
}

// Async function that returns Promise but doesn't await
async function getPromise() {
  return Promise.resolve("value");
}
```

Examples of **correct** code for this rule:

```ts
// Async function with await
async function fetchData() {
  const response = await fetch("/api/data");
  return response.json();
}

// Regular function returning Promise
function fetchDataSync() {
  return fetch("/api/data");
}

// Async function with await in conditional
async function conditionalAwait(condition: boolean) {
  if (condition) {
    return await someAsyncOperation();
  }
  return "default";
}

// Async function with await in loop
async function processItems(items: string[]) {
  const results = [];
  for (const item of items) {
    results.push(await processItem(item));
  }
  return results;
}
```

## How to use

```json
{
  "rules": {
    "typescript/require-await": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/require-await": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/require-await/)
