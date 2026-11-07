# xex-agent-cli

A strict TypeScript terminal coding agent with OpenRouter chat completions, multi-step tool calling, filesystem and process tools, structured results, and interactive permission prompts.

## Setup

```sh
npm install
copy .env.example .env   # Windows; edit the key
npm run build
```

Set `COMPUTER_AGENT_PROVIDER` once in `.env` along with that provider's key. This becomes the default for every command, so users do not need to repeat `--provider`. The command-line `--provider` option and config-file provider override it.

```env
COMPUTER_AGENT_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

The provider tries the configured model first and falls back to available OpenRouter models when a model is retired or unavailable.

## Usage

```sh
npm start "Inspect the project and explain its structure"
npm start -- --help
npm start -- --cwd C:\work --model anthropic/claude-3.5-sonnet "Review files"
npm start                  # interactive REPL; /exit quits
```

Options include `--provider`, `--base-url`, `--stream`, `--approval` (`prompt`, `safe`, `session`, `trusted`), `--history`, `--audit`, `--config`, `--diagnostics`, and `--list-plugins`. Trust controls include `--timeline` (a redacted action timeline and safe/approved/blocked/reversed summary), `--explain` (show a plan and obtain confirmation before each model tool action), `--privacy strict|warn` (block or redact secret-like tool inputs), `--task-undo` (enable the `undo_task` rollback tool), and `--replay-export file.json` (write a shareable, secret-free task replay). Set `COMPUTER_AGENT_PROVIDER` in `.env` to avoid repeating `--provider`. JSON config files are validated (unknown values are rejected) and command-line values take precedence.

Available tools include file operations (`create`, `edit`, `copy`, `move`, `delete`), git inspection, `project_check`, undo, and text search. Writes are audit-recorded when `--audit` is supplied and snapshots are kept for safe undo within the session. Files are restricted to the cwd (or repeated `--allowed-root` values), command output is capped, and a denylist blocks common destructive executables. Shell and deletion require both a permission approval and explicit `confirm: true`.

Providers have native request adapters for OpenRouter/OpenAI-compatible APIs, Anthropic, and Gemini. Keys are read only from environment variables (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) and are never printed or accepted as CLI arguments. `local`/`compatible` endpoints can be used without a key when `--base-url` is supplied.

Browser tools (`browser_open`, `browser_read`, `browser_click`, `browser_type`, and `browser_screenshot`) are optional and capability-detected. Install Playwright separately (`npm install playwright`) to enable them; no browser is downloaded by this package. Browser URLs must use HTTP(S) and resolve to public addresses; localhost, private/link-local/reserved networks, embedded credentials, and metadata endpoints are blocked. Redirect/resource validation should be treated as an additional defense, not a hostile-browser sandbox. Screenshots stay inside configured roots, and missing Playwright fails closed. GUI status is reported but real mouse/keyboard control is deliberately disabled.

Plugins are never loaded automatically. Files in `.computer-agent/plugins` can be listed safely with `xex --list-plugins`; they are only imported after an explicit `--enable-plugin plugin.mjs` option. Plugin JavaScript runs with the user's full Node.js privileges, so only enable code you trust. A local JavaScript plugin can be copied and validated with `--install-plugin path\to\plugin.mjs`; URLs, duplicate names, and invalid plugins are rejected.

Use `--browser-check` for a no-download Playwright capability check. If Playwright is installed but its browser binary is missing, install only the required browser through Playwright's own installer; this package never downloads one automatically. Provider adapters are covered by mocked-fetch tests for OpenRouter, OpenAI, Anthropic, Gemini, and local-compatible endpoints; tests never require network access or real keys.

Conversation history is validated before loading and written atomically with restrictive permissions where supported. Sensitive values are redacted before history, replay, timeline, or permission display. `--search-history text` searches valid JSON histories below the selected cwd and ignores malformed files. `--progress` writes provider/tool activity to stderr, preserving clean one-shot response output. Git tools include staged-diff and commit-review inspection; commits never stage files implicitly and still require explicit confirmation.

The agent can execute commands and modify files on the local computer. Review every confirmation carefully; dangerous actions such as deletion, shell execution, commits, and branch changes require explicit confirmation. `--diagnostics` reports whether a real OS sandbox is active; this application never pretends that path allowlists are an OS sandbox. Use an external container, VM, or OS sandbox for hostile prompts.

## Development

```sh
npm run build
npm test
npm install -g .
xex --help
```

`--stream` uses provider streaming for final text responses and safely falls back to normal completion when tools are available, because tool-call delta formats vary by provider. SSE chunks are buffered across network boundaries. Conversation files can be resumed and searched programmatically, and failed multi-file operations roll back snapshots where practical. The `browser_open` tool is optional: install `playwright` to enable it, otherwise it returns a clear missing-dependency result. `gui_status` reports that GUI control is not enabled in this MVP.
