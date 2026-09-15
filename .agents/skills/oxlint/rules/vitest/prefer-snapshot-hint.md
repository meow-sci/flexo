---
title: "vitest/prefer-snapshot-hint"
rule: "vitest/prefer-snapshot-hint"
category: "Correctness"
version: "1.59.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-snapshot-hint.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces including a hint string with snapshot matchers (toMatchSnapshot and toThrowErrorMatchingSnapshot).

### Why is this bad?

Auto-numbered snapshot names are fragile — adding or reordering assertions shifts all subsequent numbers, causing unrelated snapshots to appear changed and obscuring real differences in code review.

### Examples

Examples of **incorrect** code for this rule configured as `always`:

```js
const snapshotOutput = ({ stdout, stderr }) => {
  expect(stdout).toMatchSnapshot();
  expect(stderr).toMatchSnapshot();
};

describe("cli", () => {
  describe("--version flag", () => {
    it("prints the version", async () => {
      snapshotOutput(await runCli(["--version"]));
    });
  });

  describe("--config flag", () => {
    it("reads the config", async () => {
      const { stdout, parsedConfig } = await runCli(["--config", "jest.config.js"]);

      expect(stdout).toMatchSnapshot();
      expect(parsedConfig).toMatchSnapshot();
    });

    it("prints nothing to stderr", async () => {
      const { stderr } = await runCli(["--config", "jest.config.js"]);

      expect(stderr).toMatchSnapshot();
    });

    describe("when the file does not exist", () => {
      it("throws an error", async () => {
        await expect(
          runCli(["--config", "does-not-exist.js"]),
        ).rejects.toThrowErrorMatchingSnapshot();
      });
    });
  });
});
```

Examples of **incorrect** code for this rule configured as `multi`:

```js
const snapshotOutput = ({ stdout, stderr }) => {
  expect(stdout).toMatchSnapshot();
  expect(stderr).toMatchSnapshot();
};

describe("cli", () => {
  describe("--version flag", () => {
    it("prints the version", async () => {
      snapshotOutput(await runCli(["--version"]));
    });
  });

  describe("--config flag", () => {
    it("reads the config", async () => {
      const { stdout, parsedConfig } = await runCli(["--config", "jest.config.js"]);

      expect(stdout).toMatchSnapshot();
      expect(parsedConfig).toMatchSnapshot();
    });

    it("prints nothing to stderr", async () => {
      const { stderr } = await runCli(["--config", "jest.config.js"]);

      expect(stderr).toMatchSnapshot();
    });
  });
});
```

Examples of **correct** code for this rule configured as `always`:

```js
const snapshotOutput = ({ stdout, stderr }, hints) => {
  expect(stdout).toMatchSnapshot({}, `stdout: ${hints.stdout}`);
  expect(stderr).toMatchSnapshot({}, `stderr: ${hints.stderr}`);
};

describe("cli", () => {
  describe("--version flag", () => {
    it("prints the version", async () => {
      snapshotOutput(await runCli(["--version"]), {
        stdout: "version string",
        stderr: "empty",
      });
    });
  });

  describe("--config flag", () => {
    it("reads the config", async () => {
      const { stdout } = await runCli(["--config", "jest.config.js"]);

      expect(stdout).toMatchSnapshot({}, "stdout: config settings");
    });

    it("prints nothing to stderr", async () => {
      const { stderr } = await runCli(["--config", "jest.config.js"]);

      expect(stderr).toMatchInlineSnapshot();
    });

    describe("when the file does not exist", () => {
      it("throws an error", async () => {
        await expect(
          runCli(["--config", "does-not-exist.js"]),
        ).rejects.toThrowErrorMatchingSnapshot("stderr: config error");
      });
    });
  });
});
```

Examples of **correct** code for this rule configured as `multi`:

```js
const snapshotOutput = ({ stdout, stderr }, hints) => {
  expect(stdout).toMatchSnapshot({}, `stdout: ${hints.stdout}`);
  expect(stderr).toMatchSnapshot({}, `stderr: ${hints.stderr}`);
};

describe("cli", () => {
  describe("--version flag", () => {
    it("prints the version", async () => {
      snapshotOutput(await runCli(["--version"]), {
        stdout: "version string",
        stderr: "empty",
      });
    });
  });

  describe("--config flag", () => {
    it("reads the config", async () => {
      const { stdout } = await runCli(["--config", "jest.config.js"]);

      expect(stdout).toMatchSnapshot();
    });

    it("prints nothing to stderr", async () => {
      const { stderr } = await runCli(["--config", "jest.config.js"]);

      expect(stderr).toMatchInlineSnapshot();
    });

    describe("when the file does not exist", () => {
      it("throws an error", async () => {
        await expect(
          runCli(["--config", "does-not-exist.js"]),
        ).rejects.toThrowErrorMatchingSnapshot();
      });
    });
  });
});
```

## Configuration

This rule accepts one of the following string values:

### `"always"`

Require a hint to always be provided when using external snapshot matchers.

### `"multi"`

Require a hint to be provided when there are multiple external snapshot matchers within the scope (meaning it includes nested calls).

## How to use

```json
{
  "rules": {
    "vitest/prefer-snapshot-hint": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-snapshot-hint": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.59.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-snapshot-hint.md)
