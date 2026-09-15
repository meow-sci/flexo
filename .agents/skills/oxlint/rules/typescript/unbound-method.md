---
title: "typescript/unbound-method"
rule: "typescript/unbound-method"
category: "Correctness"
version: "1.12.0"
default: true
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/unbound-method/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | yes |


### What it does

This rule enforces unbound methods are called with their expected scope.

### Why is this bad?

When you extract a method from an object and call it separately, the `this` context is lost. This can lead to runtime errors or unexpected behavior, especially with methods that rely on `this` to access instance properties or other methods.

### Examples

Examples of **incorrect** code for this rule:

```ts
class MyClass {
  private value = 42;

  getValue() {
    return this.value;
  }

  processValue() {
    return this.value * 2;
  }
}

const instance = new MyClass();

// Unbound method - loses 'this' context
const getValue = instance.getValue;
getValue(); // Runtime error: cannot read property 'value' of undefined

// Passing unbound method as callback
[1, 2, 3].map(instance.processValue); // 'this' will be undefined

// Destructuring methods
const { getValue: unboundGetValue } = instance;
unboundGetValue(); // Runtime error
```

Examples of **correct** code for this rule:

```ts
class MyClass {
  private value = 42;

  getValue() {
    return this.value;
  }

  processValue() {
    return this.value * 2;
  }
}

const instance = new MyClass();

// Call method on instance
const value = instance.getValue(); // Correct

// Bind method to preserve context
const boundGetValue = instance.getValue.bind(instance);
boundGetValue(); // Correct

// Use arrow function to preserve context
[1, 2, 3].map(() => instance.processValue()); // Correct

// Use arrow function in class for auto-binding
class MyClassWithArrow {
  private value = 42;

  getValue = () => {
    return this.value;
  };
}

const instance2 = new MyClassWithArrow();
const getValue = instance2.getValue; // Safe - arrow function preserves 'this'
getValue(); // Correct
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignoreStatic

type: `boolean`

default: `false`

Whether to ignore unbound methods that are static.
When true, static methods can be referenced without binding.

## How to use

```json
{
  "rules": {
    "typescript/unbound-method": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/unbound-method": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/unbound-method/)
