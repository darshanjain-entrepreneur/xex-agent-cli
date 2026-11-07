# xex-agent-cli

> A trust-focused AI agent for coding and computer tasks from your terminal.

`xex` lets you use an AI model to inspect projects, work with files, run approved commands, review Git changes, and automate supported browser tasks. It is designed around visibility and user control: actions can require approval, secrets are detected and redacted, changes can be undone, and the agent reports what it can and cannot safely do.

Created and maintained by **[Darshan Jain](https://github.com/darshanjain-entrepreneur)**.

## Highlights

- **Multi-provider AI:** OpenRouter, OpenAI, Anthropic, Gemini, and local OpenAI-compatible endpoints.
- **Computer and coding tools:** Read, create, edit, copy, move, delete, search, and inspect project files.
- **Command execution:** Run processes and shell commands with timeouts, output limits, approvals, and a denylist.
- **Git and project workflows:** Inspect diffs, review repositories, and run project checks without implicit commits.
- **Trust controls:** Explain-before-execute, approval modes, action timelines, trust summaries, and progress output.
- **Privacy protection:** Detect and redact API keys, tokens, passwords, private keys, and other secret-like values.
- **Undo and auditability:** File snapshots, task-level undo, audit logs, conversation history, and redacted replay exports.
- **Safe extensibility:** Local plugins are never loaded automatically and must be explicitly enabled.
- **Optional browser tools:** Playwright-based browser actions with public-network URL restrictions.

## Install

Requirements: Node.js `18.18` or newer.

### Install from npm

Install the package globally to make the `xex` command available from any terminal:

```bash
npm install -g xex-agent-cli
xex --help
```

The npm package contains the compiled CLI in `dist/`. npm creates the `xex` command from the `bin` entry in `package.json`; you do not need to run `npm run build` after installing from npm.

### Configure an npm installation

The npm package is the program, not your provider configuration. Create `.env` in the project folder where you will run `xex`, not inside the global npm installation folder:

**Windows PowerShell:**

```powershell
mkdir my-ai-project
cd my-ai-project
npx --yes --package=xex-agent-cli node -e "require('fs').copyFileSync(require.resolve('xex-agent-cli/.env.example'), '.env.example')"
Copy-Item .env.example .env
notepad .env
```

**macOS/Linux:**

```bash
mkdir my-ai-project
cd my-ai-project
npm pack xex-agent-cli --pack-destination .
tar -xzf xex-agent-cli-*.tgz --strip-components=1 package/.env.example
cp .env.example .env
nano .env
```

Alternatively, copy the `.env.example` file from the [GitHub repository](https://github.com/darshanjain-entrepreneur/xex-agent-cli/blob/main/.env.example) into your project folder. Add your provider key to `.env`, then run:

```bash
xex "Inspect this project and explain its structure"
```

`xex` automatically reads `.env` from the current working directory. Keep `.env` private; it is for your local machine and must never be committed or shared.

For development from source:

```bash
git clone https://github.com/darshanjain-entrepreneur/xex-agent-cli.git
cd xex-agent-cli
npm install
npm run build
```

## Quick start

### 1. Create your `.env` file

Create a file named `.env` in the folder where you run `xex` (normally your project folder). Start from the included template:

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS/Linux:**

```bash
cp .env.example .env
```

Open `.env` and fill in the settings for one provider. For example, with OpenRouter:

```env
COMPUTER_AGENT_PROVIDER=openrouter
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

Replace `your_openrouter_api_key` with your real key. Do not add quotes unless your key requires them, and never commit `.env` to GitHub. The `.gitignore` file already excludes it.

For OpenAI, use this pattern instead:

```env
COMPUTER_AGENT_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
```

For Anthropic or Gemini, use the matching examples in the [Provider configuration](#provider-configuration) section. Only configure the provider you intend to use.

### 2. Run xex

After creating `.env`, configure a provider key as an environment variable, then run a prompt:

```bash
xex "Inspect this project and explain its structure"
```

Start the interactive terminal session:

```bash
xex
```

Type `/exit` to leave the session.

### Provider configuration

The `.env` file should be placed in the current working directory from which you run `xex`. `xex` loads it automatically. If you run `xex` from a different project folder, copy that folder's `.env.example` there and create a new `.env`, or set the variables in your shell.

Provider selection uses this precedence:

1. `--provider`
2. JSON config file
3. `COMPUTER_AGENT_PROVIDER`
4. `openrouter`

#### OpenRouter

```env
COMPUTER_AGENT_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

#### OpenAI

```env
COMPUTER_AGENT_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

#### Anthropic

```env
COMPUTER_AGENT_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

#### Gemini

```env
COMPUTER_AGENT_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-1.5-flash
```

#### Local or compatible servers

```bash
xex --provider local --base-url http://localhost:11434/v1 --model llama3.2 "Explain this project"
```

Keys are read from environment variables only. Never commit `.env`, place API keys in prompts, or pass secrets as command-line arguments. Use [.env.example](./.env.example) as the starting template.

## Common commands

```bash
# Choose a provider and working directory
xex --provider openai --cwd ./my-project "Find the main entry point"

# Ask for approval before risky actions
xex --approval prompt "Update the tests and run them"

# Explain every model-selected tool action first
xex --explain "Refactor the configuration module"

# Strictly block secret-like tool inputs
xex --privacy strict "Check this configuration"

# Show a redacted action timeline and trust summary
xex --timeline --progress "Review the project"

# Enable task-level rollback and export a redacted replay
xex --task-undo --replay-export replay.json "Make the requested changes"

# Inspect capabilities without making model requests
xex --diagnostics
xex --browser-check
xex --list-plugins
```

Run `xex --help` for the complete option list.

## Safety model

xex is a local tool-running agent, not an OS sandbox. Use an external container, VM, or native supervisor for untrusted prompts or hostile code.

- File access is restricted to the current directory by default. Add approved roots with `--allowed-root`.
- Destructive operations and shell execution require explicit confirmation and permission approval.
- Processes have timeouts and capped output.
- Secret-like values are blocked in `strict` privacy mode and redacted in `warn` mode.
- History, timelines, audit records, and replay exports redact sensitive values.
- Browser access is optional and blocks localhost, private, link-local, reserved, metadata, and embedded-credential destinations.
- GUI mouse and keyboard automation is disabled.

### Plugins

Plugins are JavaScript and run with the full privileges of the current user. They are **never loaded automatically**.

```bash
xex --list-plugins
xex --install-plugin path/to/plugin.mjs
xex --enable-plugin plugin.mjs "Use the plugin"
```

Only enable plugins you have reviewed and trust. Plugin listing does not execute plugin code.

### Browser tools

Browser tools are optional. Install Playwright separately:

```bash
npm install playwright
```

Browser binaries are not downloaded automatically. Use `xex --browser-check` to check availability. Browser actions include opening, reading, clicking, typing, and screenshots, subject to the network and filesystem safety policies above.

## Available capabilities

| Area | Capabilities |
| --- | --- |
| Files | Create, read, write, edit, copy, move, delete, list, search |
| Processes | Run processes and shell commands with approval and limits |
| Projects | Git inspection, project checks, staged-diff and commit review |
| Trust | Approvals, explain mode, timelines, progress, audit, replay |
| Recovery | File undo and task-level undo |
| Privacy | Secret detection, redaction, strict blocking |
| Providers | OpenRouter, OpenAI, Anthropic, Gemini, local-compatible |
| Extensibility | Explicitly enabled local plugins |
| Browser | Optional Playwright actions with public-network restrictions |

## Development

```bash
npm install
npm run build
npm run typecheck
npm test
npm audit --omit=dev
npm pack --dry-run
```

The test suite uses mocked provider responses and local temporary directories; live provider credentials are not required for tests.

## Known limitations

- OS-level sandboxing is not provided by the application.
- GUI automation is intentionally disabled.
- Browser automation requires the optional Playwright dependency and browser binaries.
- Live provider calls require your own credentials, quota, and network access.
- Shell command behavior varies across Windows, macOS, and Linux.

## Contributing

Issues and pull requests are welcome. Before opening a pull request:

1. Run the build, typecheck, and test commands.
2. Do not include `.env`, API keys, history files, logs, or generated secrets.
3. Document security-sensitive behavior and add regression tests.

Please report suspected security vulnerabilities privately rather than publishing exploit details in a public issue.

## License

This project is released under the [MIT License](./LICENSE).

## Author

**Darshan Jain**

- GitHub: [@darshanjain-entrepreneur](https://github.com/darshanjain-entrepreneur)
- Project: [xex-agent-cli](https://github.com/darshanjain-entrepreneur/xex-agent-cli)
