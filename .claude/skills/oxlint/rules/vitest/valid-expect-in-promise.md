---
title: "vitest/valid-expect-in-promise"
rule: "vitest/valid-expect-in-promise"
category: "Correctness"
version: "1.60.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-expect-in-promise.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Ensures that `expect` calls inside promise chains (`.then()`, `.catch()`,
`.finally()`) are properly awaited or returned from the test.

### Why is this bad?

When `expect` is called inside a promise callback that is not awaited or
returned, the test may pass even if the assertion fails because the test
completes before the promise resolves. This leads to silently passing
tests with broken assertions.

### Examples

Examples of **incorrect** code for this rule:

```javascript
test("promise test", async () => {
  something().then((value) => {
    expect(value).toBe("red");
  });
});

test("promises test", () => {
  const onePromise = something().then((value) => {
    expect(value).toBe("red");
  });
  const twoPromise = something().then((value) => {
    expect(value).toBe("blue");
  });

  return Promise.any([onePromise, twoPromise]);
});
```

Examples of **correct** code for this rule:

```javascript
test("promise test", async () => {
  await something().then((value) => {
    expect(value).toBe("red");
  });
});

test("promises test", () => {
  const onePromise = something().then((value) => {
    expect(value).toBe("red");
  });
  const twoPromise = something().then((value) => {
    expect(value).toBe("blue");
  });

  return Promise.all([onePromise, twoPromise]);
});
```

## How to use

```json
{
  "rules": {
    "vitest/valid-expect-in-promise": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/valid-expect-in-promise": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.60.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-expect-in-promise.md)
