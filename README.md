# editorconfig

[![npm version](https://img.shields.io/npm/v/@sheplu/editorconfig.svg)](https://www.npmjs.com/package/@sheplu/editorconfig)
[![Quality gates](https://github.com/sheplu/editorconfig/actions/workflows/quality-gates.yaml/badge.svg)](https://github.com/sheplu/editorconfig/actions/workflows/quality-gates.yaml)
[![Node.js](https://img.shields.io/node/v/@sheplu/editorconfig.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A small CLI to manage a **consistent `.editorconfig`** across your projects.

- ✅ Generate a sane default `.editorconfig` in seconds
- ✅ Check if your existing file matches the target setup
- ✅ Confirm before overwriting an existing `.editorconfig` (or pass `--overwrite` to skip the prompt)
- ✅ Override the built-in template with a team-shared file via `--template` (local path or `https://` URL)
- ✅ Validate every `.editorconfig` in a monorepo at once with `--recursive`

## Why?

Keeping `.editorconfig` aligned across multiple repositories is boring and error-prone:

- Some repos have no `.editorconfig`
- Some have outdated or partial settings
- People copy–paste from “somewhere” and drift over time

This CLI aims to provide a **single source of truth** for your preferred `.editorconfig`, and a few helpers to keep it in sync.

## Installation

You can use it **without installing**, via `npx`:

```bash
npx @sheplu/editorconfig --mode=write
```

Or install it globally:

```bash
npm install -g @sheplu/editorconfig
editorconfig
```

Or as a dev dependency:

```bash
npm install -D @sheplu/editorconfig
```

## Quick Start

From the root of your project:

```bash
npx @sheplu/editorconfig --mode=write
```

This will:

- Create a `.editorconfig` file if it doesn’t exist
- Write the default template
- Ask before overwriting an existing file (or fail in non-interactive contexts unless `--overwrite` is passed)

## Current Features

### `write`

```bash
npx @sheplu/editorconfig --mode=write
```

Creates a base `.editorconfig` file in the current directory.

If a `.editorconfig` already exists at the target path, the CLI will:

- Prompt for confirmation in an interactive terminal (`y` / `yes` to overwrite, anything else keeps the file).
- Exit non-zero in non-interactive contexts (CI, redirected stdin) so a script never silently destroys an existing config.

Pass `--overwrite` (or `-o`) to bypass the prompt and force a rewrite:

```bash
npx @sheplu/editorconfig --mode=write --overwrite
```

You can also point at a custom path:

```bash
npx @sheplu/editorconfig --mode=write --path=path/to/.editorconfig
```

Typical content (example):

```ini
root = true

[*]
indent_style = tab
indent_size = 4
tab_width = 4
end_of_line = lf
charset = utf-8
spelling_language = en
trim_trailing_whitespace = true
insert_final_newline = true
quote_type = single
spaces_around_operators = true
```

### `check`

```bash
npx @sheplu/editorconfig --mode=check
```

Validates your existing `.editorconfig` and reports any drift from the target configuration.

This command will:

- Read your existing .editorconfig
- Compare it against the tool’s canonical template
- Exit with:
  - `0` if everything matches
  - `1` if differences are found

### `--recursive` (monorepo check)

```bash
npx @sheplu/editorconfig --mode=check --recursive
```

Walks the current directory (or the directory passed via `--path`) and validates **every** `.editorconfig` it finds. Useful for monorepos where a top-level file sets defaults and sub-packages add narrower overrides.

How files are classified:

- The shortest-path `.editorconfig` in each subtree is treated as the **root** and validated with the same rules as `--mode=check` (must declare `root = true`, must have `[*]`, sections must match the canonical template).
- Deeper `.editorconfig` files are treated as **children**. Children must NOT declare `root = true`, may omit `[*]`, and may legitimately override individual keys.
- Sibling subtrees with no shared ancestor `.editorconfig` are each validated as their own root.

Cross-file checks emitted on top of per-file validation:

- `child-root` — a child declared `root = true` (**fail**).
- `redundant` — a child redeclares a parent key/value verbatim (**warn**).
- `contradiction` — a child reuses the same header as its root (e.g. both `[*]`) with a different value (**warn**). Different globs like child `[*.js]` overriding root `[*]` are silent — they are legitimate per spec.

Skipped during the walk: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.cache`, and symlinked directories.

Flag interactions in recursive mode:

- `--path` becomes the start directory for the walk (default: cwd).
- `--languages` is enforced on the root file only — children may add or omit language sections freely.
- `--template` overrides apply to the root section comparison.
- `--strict` fails on unknown headers in any file.

Exit codes: `0` on pass (warnings allowed), `1` if any file fails or any cross-file failure (e.g. child-root) is detected.

```bash
# Validate everything under cwd
npx @sheplu/editorconfig --mode=check --recursive

# Validate only one subtree
npx @sheplu/editorconfig --mode=check --recursive --path=./packages/web

# CI: enforce js/md sections on the root, anywhere else may add what they need
npx @sheplu/editorconfig --mode=check --recursive --languages=js,md
```

### `--template` (custom team template)

Both `write` and `check` accept a `--template` (or `-t`) flag pointing at a custom `.editorconfig`-syntax file. Sections in that file override the built-in defaults; languages it doesn't redefine still come from the built-ins. This lets a team host a single source of truth and reference it from every repo.

The flag accepts either a local path or an `https://` URL:

```bash
# local file
npx @sheplu/editorconfig --mode=write --template=./team.editorconfig

# remote URL
npx @sheplu/editorconfig --mode=check --template=https://raw.githubusercontent.com/example/team-config/main/.editorconfig
```

The custom template must follow the same semantics as the built-ins:

- Use only known section headers (`[*]`, `[*.md]`, `[*.{js,jsx,...}]`, etc.). Unknown headers (like `[*.proto]`) are rejected.
- Include `root = true` in the preamble whenever the template redefines `[*]`.
- Each header may appear at most once.

URL fetching is constrained for safety: `https://` only (`http://` is rejected before any network call), redirects must stay on https (max 5 hops), 10-second timeout, 1 MB response cap. Templates are fetched on every invocation — there is no local cache.

### `--help`

```bash
npx @sheplu/editorconfig --help
```

Prints the full usage, the available commands, and every supported option.

## Planned / Upcoming Features

### 1. Interactive update / replace

```bash
npx @sheplu/editorconfig --mode=fix
```

### 2. Compare with target setup

```bash
npx @sheplu/editorconfig --mode=diff
```

## Roadmap

- [ ] Add diff logic and `diff` command
- [ ] Add interactive `fix` / `update` command
- [ ] Expose presets or configuration options

Additional properties can be found on the [editorconfig wiki](https://github.com/editorconfig/editorconfig/wiki/editorconfig-properties).

## Tests

Tests live under `test/` and are split by scope:

- `test/unit/` — fast, in-process tests of exported functions (no spawning, no I/O beyond a tmp dir).
- `test/integration/` — full CLI runs. The interactive prompt path is exercised in a real pseudoterminal via [`node-pty`](https://github.com/microsoft/node-pty); the rest go through `child_process.spawnSync` with a closed stdin.

`node-pty` ships a native binding that npm normally compiles via a postinstall script. This repo sets `ignore-scripts=true` in `.npmrc`, so after `npm install` you need to build it once:

```bash
node --run rebuild:native
```

Run them with:

```bash
node --run test             # everything
node --run test:unit        # unit only — runs in ~50ms
node --run test:integration # integration only — spawns the CLI
node --run test:coverage    # coverage with 95% threshold
node --run lint             # oxlint
```

CI runs lint, audit, and the full suite on every PR across Node 24 / 26.

## Documentation

[Editorconfig documentation](https://github.com/editorconfig/editorconfig/wiki/editorconfig-properties)
