---
title: "jest/no-conditional-expect"
rule: "jest/no-conditional-expect"
category: "Correctness"
version: "0.0.12"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-conditional-expect.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule prevents the use of `expect` in conditional blocks, such as `if` and `catch`.
This includes using `expect` in callbacks to functions named `catch`, which are assumed to be promises.

### Why is this bad?

Jest only considers a test to have failed if it throws an error, meaning if calls to
assertion functions like `expect` occur in conditional code such as a `catch` statement,
tests can end up passing but not actually test anything. Additionally, conditionals
tend to make tests more brittle and complex, as they increase the amount of mental
thinking needed to understand what is actually being tested.

### Examples

Examples of **incorrect** code for this rule:

```js
it("foo", () => {
  doTest && expect(1).toBe(2);
});

it("bar", () => {
  if (!skipTest) {
    expect(1).toEqual(2);
  }
});

it("baz", async () => {
  try {
    await foo();
  } catch (err) {
    expect(err).toMatchObject({ code: "MODULE_NOT_FOUND" });
  }
});

it("throws an error", async () => {
  await foo().catch((error) => expect(error).toBeInstanceOf(error));
});
```

Examples of **correct** code for this rule:

```js
it("foo", () => {
  expect(!value).toBe(false);
});

function getValue() {
  if (process.env.FAIL) {
    return 1;
  }
  return 2;
}

it("foo", () => {
  expect(getValue()).toBe(2);
});

it("validates the request", () => {
  try {
    processRequest(request);
  } catch {
  } finally {
    expect(validRequest).toHaveBeenCalledWith(request);
  }
});

it("throws an error", async () => {
  await expect(foo).rejects.toThrow(Error);
});
```

## How to use

```json
{
  "rules": {
    "jest/no-conditional-expect": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/no-conditional-expect": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.12.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-conditional-expect.md)
