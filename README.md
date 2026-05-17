# sv-repair-agent

TypeScript CLI for automatic SystemVerilog syntax/lint repair using Verilator and Pi Coding Agent.

## Requirements

- Node.js 20+
- Verilator in `PATH`
- Pi Coding Agent in `PATH`

Install Pi:

```sh
npm install -g @earendil-works/pi-coding-agent
```

## Setup

```sh
npm install
cp .env.example .env
npm run build
```

Configure `.env` or shell environment:

```sh
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_API_KEY=local-key
OPENAI_MODEL=qwen2.5-coder-32b-instruct
```

## Usage

```sh
sv-repair-agent --file path/to/top.sv
```

During development:

```sh
npm run dev -- --file examples/broken.sv
```

The CLI:

1. Creates `<file>.bak` if it does not already exist.
2. Runs `verilator --lint-only --sv <file>`.
3. Exits with `Syntax check PASS` when Verilator passes.
4. Sends Verilator errors to Pi Coding Agent when Verilator fails.
5. Streams Pi output live with timestamped `[PI]` log lines.
6. Repeats repair up to 3 attempts.
7. Prints `Syntax check FAIL` and final Verilator output if still failing.

Logs are saved under `logs/run-<timestamp>.log`.

## Pi Integration

Pi execution is isolated in `src/pi.ts`. The default invocation shape is:

```sh
OPENAI_BASE_URL=<url> OPENAI_API_KEY=<key> OPENAI_MODEL=<model> pi "<repair prompt>"
```

If the installed Pi CLI changes its scriptable interface, update only `src/pi.ts`.
