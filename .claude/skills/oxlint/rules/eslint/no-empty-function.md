---
title: "eslint/no-empty-function"
rule: "eslint/no-empty-function"
category: "Restriction"
version: "0.3.3"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-empty-function"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallows the usage of empty functions.

### Why is this bad?

Empty functions can reduce readability because readers need to guess whether it's
intentional or not. So writing a clear comment for empty functions is a good practice.

### Examples

Examples of **incorrect** code for this rule:

```typescript
function foo() {}

const bar = () => {};

class Foo {
  constructor();
  someMethod() {}
  set bar(value) {}
}
```

Examples of **correct** code for this rule:

```typescript
function foo() {
  // do nothing
}

function foo() {
  return;
}
const add = (a, b) => a + b;

class Foo {
  // constructor body is empty, but it declares a private property named
  // `_name`
  constructor(private _name: string) {}

  public get name() {
    return this._name;
  }
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### allow

type: `array`

Types of functions that are allowed to be empty.

By default, no function kinds are allowed to be empty, but this option can be used to
permit specific kinds of functions.

Example:

```json
{
  "no-empty-function": [
    "error",
    {
      "allow": ["constructors"]
    }
  ]
}
```

#### allow[n]

type: `"functions" | "arrowFunctions" | "generatorFunctions" | "methods" | "generatorMethods" | "getters" | "setters" | "constructors" | "asyncFunctions" | "asyncMethods" | "privateConstructors" | "protectedConstructors" | "decoratedFunctions" | "overrideMethods"`

Kinds of functions that can be allowed to be empty.

##### `"functions"`

Allow empty regular functions.

```js
function foo() {}
```

##### `"arrowFunctions"`

Allow empty arrow functions.

```js
const foo = () => {};
```

##### `"generatorFunctions"`

Allow empty generator functions.

```js
function* foo() {}
```

##### `"methods"`

Allow empty methods.

```js
class Foo {
  bar() {}
}
```

##### `"generatorMethods"`

Allow empty generator methods.

```js
class Foo {
  *bar() {}
}
```

##### `"getters"`

Allow empty getters.

```js
class Foo {
  get bar() {}
}
```

##### `"setters"`

Allow empty setters.

```js
class Foo {
  set bar(value) {}
}
```

##### `"constructors"`

Allow empty constructors.

```js
class Foo {
  constructor() {}
}
```

##### `"asyncFunctions"`

Allow empty async functions.

```js
async function foo() {}
```

##### `"asyncMethods"`

Allow empty async methods.

```js
class Foo {
  async bar() {}
}
```

##### `"privateConstructors"`

Allow empty private constructors.

```ts
class Foo {
  private constructor() {}
}
```

##### `"protectedConstructors"`

Allow empty protected constructors.

```ts
class Foo {
  protected constructor() {}
}
```

##### `"decoratedFunctions"`

Allow empty decorated functions.

```js
class Foo {
  @decorator()
  bar() {}
}
```

##### `"overrideMethods"`

Allow empty override methods.

```ts
class Foo extends Base {
  override bar() {}
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-empty-function": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-empty-function": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-empty-function)
