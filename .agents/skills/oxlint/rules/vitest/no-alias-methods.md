---
title: "vitest/no-alias-methods"
rule: "vitest/no-alias-methods"
category: "Style"
version: "0.0.12"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-alias-methods.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces Vitest's canonical matcher names instead of aliases.

### Why is this bad?

Vitest matcher aliases are discouraged because they make matcher usage inconsistent.
This rule makes it easier to search for all occurrences of a matcher and ensures consistency among matcher names.

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect(a).toBeCalled();
expect(a).toBeCalledTimes();
expect(a).toBeCalledWith();
expect(a).lastCalledWith();
expect(a).nthCalledWith();
expect(a).toReturn();
expect(a).toReturnTimes();
expect(a).toReturnWith();
expect(a).lastReturnedWith();
expect(a).nthReturnedWith();
expect(a).toThrowError();
```

Examples of **correct** code for this rule:

```javascript
expect(a).toHaveBeenCalled();
expect(a).toHaveBeenCalledTimes();
expect(a).toHaveBeenCalledWith();
expect(a).toHaveBeenLastCalledWith();
expect(a).toHaveBeenNthCalledWith();
expect(a).toHaveReturned();
expect(a).toHaveReturnedTimes();
expect(a).toHaveReturnedWith();
expect(a).toHaveLastReturnedWith();
expect(a).toHaveNthReturnedWith();
expect(a).toThrow();
```

## How to use

```json
{
  "rules": {
    "vitest/no-alias-methods": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-alias-methods": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.12.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-alias-methods.md)
