---
title: "Quickstart"
description: Install Oxlint and learn the common workflows.
---

# Quickstart

This page shows the recommended setup for Oxlint and the most common workflows, with copy-paste commands.

## Install

Install `oxlint` as a dev dependency:


```sh
$ npm add -D oxlint
```

```sh
$ pnpm add -D oxlint
```

```sh
$ yarn add -D oxlint
```

```sh
$ bun add -D oxlint
```


Add lint commands to `package.json`:

```json
{
  "scripts": {
    "lint": "oxlint",
    "lint:fix": "oxlint --fix"
  }
}
```

Run it:


```sh
npm run lint
```

```sh
pnpm run lint
```

```sh
yarn run lint
```

```sh
bun run lint
```


Apply fixes:


```sh
npm run lint:fix
```

```sh
pnpm run lint:fix
```

```sh
yarn run lint:fix
```

```sh
bun run lint:fix
```


## Usage

For the complete list of options, see the [CLI reference](./cli.md).

```sh
oxlint [OPTIONS] [PATH]...
```

If `PATH` is omitted, Oxlint lints the current working directory.

## Common workflows

### Pre-commit with [lint-staged](https://npmx.dev/package/lint-staged)


```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx,mjs,cjs}": "npm run lint"
  }
}
```

```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx,mjs,cjs}": "pnpm run lint"
  }
}
```

```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx,mjs,cjs}": "yarn run lint"
  }
}
```

```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx,mjs,cjs}": "bun run lint"
  }
}
```


### Create a config file

Initialize the `.oxlintrc.json` config with default values:

```sh
oxlint --init
```

Then customize `.oxlintrc.json` as needed. See [Configuration](./config.md).

Alternatively, Oxlint supports a TypeScript config file named `oxlint.config.ts`. See [Configuration](./config.md#typescript-config) for details.

Then run Oxlint:

```sh
oxlint
```

> **Tip:** If you are migrating from ESLint, see [the "Migrate from ESLint" page](./migrate-from-eslint.md) for detailed guidance on migrating.


### Fix problems

Apply safe fixes:

```sh
oxlint --fix
```

Apply suggestions (may change program behavior):

```sh
oxlint --fix-suggestions
```

Apply dangerous fixes and suggestions:

```sh
oxlint --fix-dangerously
```

See [Automatic fixes](./automatic-fixes.md) for guidance on when to use each mode.

### Ignore files

Use an explicit ignore file:

```sh
oxlint --ignore-path .oxlintignore
```

Add ignore patterns from the command line:

```sh
oxlint --ignore-pattern "dist/**" --ignore-pattern "*.min.js"
```

Disable ignore handling:

```sh
oxlint --no-ignore
```

See [Ignore files](./ignore-files.md).

### Fail CI reliably

Only report errors:

```sh
oxlint --quiet
```

Fail if any warnings are found:

```sh
oxlint --deny-warnings
```

Fail if warnings exceed a threshold:

```sh
oxlint --max-warnings 0
```

See [CI setup](./ci.md).

### Use machine-readable output

Select an output format:

```sh
oxlint -f json
```

Available formats include: `default`, `json`, `unix`, `checkstyle`, `github`, `gitlab`, `junit`, and `stylish`. See [Output formats](./output-formats.md) for more info.

### Inspect the effective configuration

Print the configuration that would be used for a file:

```sh
oxlint --print-config path/to/file.ts
```

### List available rules

List registered rules, including those enabled by your current Oxlint config:

```sh
oxlint --rules
```

The full list is in the [Rules reference](./rules.md).

## Next steps

- Configure rules, plugins, and ignores: [Configuration](./config.md)
- [Setup editors](./editors.md)
- [Setup CI](./ci.md)
- Learn advanced features: [Multi-file analysis](./multi-file-analysis.md), [Type-aware linting](./type-aware.md), [JS plugins](./js-plugins.md)
- Migrate: [From ESLint](./migrate-from-eslint.md) <!-- , [From Biome](./migrate-from-biome.md) -->
- [Compatibility matrix](https://oxc.rs/compatibility)
- [CLI reference](./cli.md)
