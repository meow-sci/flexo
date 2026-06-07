---
title: "vitest/no-interpolation-in-snapshots"
rule: "vitest/no-interpolation-in-snapshots"
category: "Style"
version: "0.0.13"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-interpolation-in-snapshots.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents the use of string interpolations in snapshots.

### Why is this bad?

Interpolation prevents snapshots from being updated. Instead, properties should
be overloaded with a matcher by using
[property matchers](https://jestjs.io/docs/en/snapshot-testing#property-matchers).

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect(something).toMatchInlineSnapshot(
  `Object {
    property: ${interpolated}
  }`,
);

expect(something).toMatchInlineSnapshot(
  { other: expect.any(Number) },
  `Object {
    other: Any<Number>,
    property: ${interpolated}
  }`,
);

expect(errorThrowingFunction).toThrowErrorMatchingInlineSnapshot(`${interpolated}`);
```

## How to use

```json
{
  "rules": {
    "vitest/no-interpolation-in-snapshots": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-interpolation-in-snapshots": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-interpolation-in-snapshots.md)
