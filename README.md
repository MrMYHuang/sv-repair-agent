# sv-repair-agent

TypeScript CLI for automatic SystemVerilog syntax/lint repair using Verilator and Pi Coding Agent.

## Requirements

- Node.js 20+
- Verilator in `PATH`
- Pi Coding Agent SDK package

The SDK dependency is installed by `npm install`. If you also want the standalone Pi CLI:

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

## Repair Loop

```mermaid
flowchart TD
  Input(["Input .sv"])
  Backup[["Backup .bak"]]
  FinalFile[["Repaired .sv"]]
  Logs[["Run log"]]

  subgraph CheckStage["Syntax Check"]
    Verilator["Verilator"]
    Check{"PASS?"}
    Errors["Errors"]
  end

  subgraph RepairStage["Repair Attempt 1..3"]
    Prompt["Prompt"]
    Pi["Pi SDK"]
    LLM["LLM"]
    Tools["Edit tools"]
    Attempts{"Retry?"}
  end

  Pass(["PASS"])
  Fail(["FAIL"])

  Input --> Backup --> Verilator
  Verilator --> Check
  Check -->|Yes| Pass
  Check -->|No| Errors --> Prompt --> Pi
  Pi <--> LLM
  Pi --> Tools --> FinalFile
  FinalFile --> Attempts
  Attempts -->|retry| Verilator
  Attempts -->|stop| Fail
  Verilator -.-> Logs
  Pi -.-> Logs
  Errors -.-> Logs

  classDef file fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a,stroke-width:1.6px
  classDef process fill:#e2e8f0,stroke:#64748b,color:#0f172a,stroke-width:1.4px
  classDef decision fill:#ffedd5,stroke:#fb923c,color:#7c2d12,stroke-width:1.6px
  classDef agent fill:#ede9fe,stroke:#8b5cf6,color:#3b0764,stroke-width:1.6px
  classDef success fill:#dcfce7,stroke:#22c55e,color:#14532d,stroke-width:1.8px
  classDef failure fill:#fee2e2,stroke:#ef4444,color:#7f1d1d,stroke-width:1.8px
  classDef log fill:#cffafe,stroke:#06b6d4,color:#164e63,stroke-width:1.4px,stroke-dasharray:4 3

  class Input,Backup,FinalFile file
  class Logs log
  class Verilator,Errors,Prompt,Tools process
  class Check,Attempts decision
  class Pi,LLM agent
  class Pass success
  class Fail failure
```

## Pi Integration

Pi execution is isolated in `src/pi.ts`. The tool uses the Pi Coding Agent SDK directly:

- `createAgentSession`
- in-memory auth, settings, and session storage
- a dynamically registered OpenAI-compatible provider from `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `OPENAI_MODEL`
- built-in Pi coding tools: `read`, `bash`, `edit`, and `write`

If the SDK integration needs to change, update only `src/pi.ts`.
