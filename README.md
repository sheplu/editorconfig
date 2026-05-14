# editorconfig

A small CLI to manage a **consistent `.editorconfig`** across your projects.

- ✅ Generate a sane default `.editorconfig` in seconds
- ✅ Check if your existing file matches the target setup
- ✅ Confirm before overwriting an existing `.editorconfig` (or pass `--overwrite` to skip the prompt)
- 🔜 Compare your file against the recommended template

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

Run them with:

```bash
npm test                  # everything
npm run test:unit         # unit only — runs in ~50ms
npm run test:integration  # integration only — spawns the CLI
npm run lint              # oxlint
```

CI runs lint, audit, and the full suite on every PR across Node 22 / 24 / 26.

## Documentation

[Editorconfig documentation](https://github.com/editorconfig/editorconfig/wiki/editorconfig-properties)
