Create a TypeScript CLI project: "sv-repair-agent".

Use Pi Coding Agent as the OSS coding agent for automatic SystemVerilog repair.

Pi reference:
- OSS repo/package: @earendil-works/pi-coding-agent
- Pi is a minimal terminal coding harness with file editing and command execution support.
- Use the Pi Coding Agent SDK from the npm package dependency.
- The standalone Pi CLI is not required for this project.

Goal:
Build a TypeScript CLI tool that:
1. Reads one SystemVerilog file
2. Runs Verilator syntax/lint checking
3. Repairs errors using Pi Coding Agent
4. Repeats the repair loop up to 3 times
5. Streams detailed logs to terminal
6. Reports final PASS or FAIL

CLI usage:
  sv-repair-agent --file path/to/top.sv

Core workflow:
1. Run Verilator:
   verilator --lint-only --sv <file>

2. If Verilator passes:
   print "Syntax check PASS"
   exit 0

3. If Verilator fails:
   capture stdout/stderr
   generate repair prompt
   invoke Pi Coding Agent through its SDK
   stream Pi assistant text deltas live to terminal
   re-run Verilator

4. Maximum repair attempts:
   3

5. If still failing after 3 attempts:
   print "Syntax check FAIL"
   print final Verilator errors
   exit 1

Technology:
- TypeScript
- Node.js
- commander
- execa
- dotenv
- chalk
- dayjs

Project structure:
src/
  index.ts
  verilator.ts
  pi.ts
  repairLoop.ts
  logger.ts
  config.ts
  types.ts

Environment variables:
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_API_KEY=local-key
OPENAI_MODEL=qwen2.5-coder-32b-instruct

Pi integration:
- Add @earendil-works/pi-coding-agent as a package dependency.
- Use the Pi Coding Agent SDK directly from src/pi.ts.
- Validate that the SDK package is loadable before execution.
- Use OpenAI-compatible API configuration.
- The API URL, key, and model must be configurable.
- Create a Pi agent session with cwd set to the directory containing the target file.
- Use in-memory auth, settings, and session storage so the tool does not depend on ~/.pi state.
- Register a dynamic OpenAI-compatible provider/model from OPENAI_BASE_URL, OPENAI_API_KEY, and OPENAI_MODEL.
- Enable only the Pi tools needed for repair: read, bash, edit, write.
- Disable compaction and automatic retries for predictable repair-loop behavior.
- Invoke session.prompt(...) programmatically with the repair prompt.
- Subscribe to Pi SDK events and stream assistant text_delta chunks live to terminal.
- Inspect session.state.messages after prompt completion; if the last assistant message has stopReason: "error", treat the Pi repair attempt as failed.

Example Pi SDK integration shape:
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(providerId, OPENAI_API_KEY);

  const modelRegistry = ModelRegistry.inMemory(authStorage);
  modelRegistry.registerProvider(providerId, {
    baseUrl: OPENAI_BASE_URL,
    apiKey: OPENAI_API_KEY,
    api: "openai-completions",
    models: [{ id: OPENAI_MODEL, ... }]
  });

  const { session } = await createAgentSession({
    cwd: targetFileDirectory,
    model,
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(targetFileDirectory),
    settingsManager: SettingsManager.inMemory(...),
    tools: ["read", "bash", "edit", "write"]
  });

  session.subscribe(...text_delta streaming...);
  await session.prompt(repairPrompt, { source: "rpc" });

Keep all Pi SDK setup isolated in src/pi.ts so provider/model/session behavior can be changed easily.

Logging requirements:
Every log line must include:
- timestamp
- repair loop iteration
- log level

Example:
[2026-05-17 20:31:12] [Attempt 1/3] [INFO] Running Verilator
[2026-05-17 20:31:13] [Attempt 1/3] [ERROR] Verilator syntax check failed
[2026-05-17 20:31:13] [Attempt 1/3] [PROMPT] <prompt sent to Pi>
[2026-05-17 20:31:14] [Attempt 1/3] [PI] Streaming response chunk...
[2026-05-17 20:31:20] [Attempt 1/3] [INFO] Re-running Verilator

Logging details:
- INFO -> blue
- WARN -> yellow
- ERROR -> red
- SUCCESS -> green
- PROMPT -> magenta
- PI -> cyan

Streaming requirements:
- Stream Pi SDK assistant text deltas live to terminal.
- Do not wait until session.prompt(...) completes before printing output.
- Prefix each streamed output line with timestamp, attempt number, and [PI].
- Capture full Pi output in memory for debugging.
- Print/log Pi attempt status after completion.
- Save all logs to:
  logs/run-<timestamp>.log

Repair prompt sent to Pi:
You are an expert SystemVerilog repair agent.

Fix the Verilator syntax/lint errors in the target SystemVerilog file.

Target file:
{{FILE_PATH}}

Rules:
- Modify only the target SystemVerilog file.
- Preserve original design intent.
- Fix only syntax, lint, or compiler errors.
- Keep changes minimal.
- Do not create unrelated files.
- Do not rewrite the architecture unless required.
- After editing, the file must pass:
  {{VERILATOR_COMMAND}}

Verilator output:
{{VERILATOR_ERROR}}

Implementation requirements:
- Use execa for Verilator execution.
- Use Pi Coding Agent SDK for repair execution; do not shell out to the pi CLI.
- Handle Ctrl+C gracefully.
- Validate Verilator installation.
- Validate Pi SDK availability.
- Validate required env vars.
- Save final repaired file in-place.
- Exit code 0 only when syntax passes.
- Exit code 1 otherwise.

Artifacts to generate:
- package.json
- tsconfig.json
- .env.example
- README.md
- examples/broken.sv
