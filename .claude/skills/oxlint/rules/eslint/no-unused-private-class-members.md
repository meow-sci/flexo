---
title: "eslint/no-unused-private-class-members"
rule: "eslint/no-unused-private-class-members"
category: "Correctness"
version: "0.1.1"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-unused-private-class-members"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow unused private class members.

### Why is this bad?

Private class members that are declared and not used anywhere in the code are most likely an error due to incomplete refactoring. Such class members take up space in the code and can lead to confusion by readers.

### Examples

Examples of **incorrect** code for this rule:

```javascript
class A {
  #unusedMember = 5;
}

class B {
  #usedOnlyInWrite = 5;
  method() {
    this.#usedOnlyInWrite = 42;
  }
}

class C {
  #usedOnlyToUpdateItself = 5;
  method() {
    this.#usedOnlyToUpdateItself++;
  }
}

class D {
  #unusedMethod() {}
}

class E {
  get #unusedAccessor() {}
  set #unusedAccessor(value) {}
}
```

Examples of **correct** code for this rule:

```javascript
class A {
  #usedMember = 42;
  method() {
    return this.#usedMember;
  }
}

class B {
  #usedMethod() {
    return 42;
  }
  anotherMethod() {
    return this.#usedMethod();
  }
}

class C {
  get #usedAccessor() {}
  set #usedAccessor(value) {}

  method() {
    this.#usedAccessor = 42;
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-unused-private-class-members": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-unused-private-class-members": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-unused-private-class-members)
