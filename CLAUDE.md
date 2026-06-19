# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Binary Dependency

The SDK depends on a compiled Go runtime binary (`localharness`) bundled in platform-specific PyPI wheels. **Cloning this repo alone is not enough to run the SDK.** Always install from PyPI:

```sh
pip install google-antigravity
export GEMINI_API_KEY="your_api_key_here"
```

The binary is included in wheels under `google/antigravity/bin/`. The release script places it there before building each wheel.

## Running Tests

Tests use `unittest.IsolatedAsyncioTestCase` and are co-located with their modules (`{module}_test.py`).

```sh
# Run all tests
python -m pytest google/antigravity/

# Run tests in a specific module
python -m pytest google/antigravity/agent_test.py

# Run a single test
python -m unittest google.antigravity.agent_test.AgentTest.test_agent_lifecycle
```

Dev dependencies: `pip install -e ".[dev]"`

## Running Examples

```sh
python ./examples/getting_started/hello_world.py
```

CI (`.github/workflows/run_examples.yml`) runs all non-interactive examples in `examples/getting_started/` against Ubuntu and macOS.

## Architecture

The SDK is organized into three layers:

| Layer | Module | Purpose |
|---|---|---|
| 1 — High-level | `agent.py` | `Agent` async context manager; manages the full lifecycle |
| 2 — Session | `conversation/` | `Conversation` accumulates step history, provides `chat()` |
| 3 — Transport | `connections/` | `Connection` / `ConnectionStrategy` ABCs; `connections/local/` is the only current implementation |

**Data flow:** `Agent.__aenter__` wires up `ToolRunner`, `HookRunner`, and `TriggerRunner`, then calls `config.create_strategy()` → `ConnectionStrategy.__aenter__` → `Conversation.create()`. Thereafter `agent.chat(prompt)` → `conversation.chat()` → `connection.send()` + `connection.receive_steps()`.

### Key modules

- `google/antigravity/types.py` — All public boundary types (Pydantic V2, no proto deps). This is the canonical source of truth for `Content`, `Step`, `ToolCall`, `ToolResult`, `ChatResponse`, `CapabilitiesConfig`, etc.
- `google/antigravity/connections/connection.py` — ABCs: `AgentConfig`, `Connection`, `ConnectionStrategy`. Layer 2 depends only on these interfaces, never on transport specifics.
- `google/antigravity/connections/local/` — Concrete implementation using WebSockets to the Go harness; `localharness_pb2.py` is generated protobuf.
- `google/antigravity/hooks/hooks.py` — Hook base classes (`InspectHook`, `DecideHook`, `TransformHook`) and all concrete hook interfaces (`PreTurnHook`, `PreToolCallDecideHook`, `OnInteractionHook`, etc.), plus function-decorator shorthands (`@hooks.pre_turn`, `@hooks.post_tool_call`, …).
- `google/antigravity/hooks/policy.py` — `enforce()`, `allow_all()`, `deny_all()`, `allow()`: declarative tool-call policy enforcement wired as a hook.
- `google/antigravity/tools/tool_runner.py` — Registers Python callables, auto-detects sync/async, executes tools, injects `ToolContext`.
- `google/antigravity/triggers/` — Background tasks (`Trigger`) that push notifications into the agent via `connection.send_trigger_notification()`.

### Adding a new connection backend

Create `google/antigravity/connections/{name}/` following the `local/` pattern:
1. Subclass `AgentConfig` and implement `create_strategy()`.
2. Subclass `ConnectionStrategy` and `Connection`.
3. Export the new `AgentConfig` subclass from `__init__.py` if it should be part of the public API.

### Safety policy requirement

`Agent.__aenter__` raises `ValueError` if write tools or MCP servers are enabled without at least one policy or a `PreToolCallDecideHook`. Always supply a policy:

```python
from google.antigravity.hooks import policy
config = LocalAgentConfig(..., policies=[policy.allow_all()])
```

## Code Conventions

- **Copyright header:** Every source file starts with the Apache 2.0 header (Copyright 2026 Google LLC).
- **Async-first:** All I/O paths are `async`. Tool functions may be sync or async; `ToolRunner` wraps sync callables via `asyncio.to_thread`.
- **Pydantic V2 everywhere:** Public APIs use models from `types.py`. Use `model_copy(deep=True)` when you need isolated copies.
- **Test style:** `unittest.IsolatedAsyncioTestCase` + heavy `@mock.patch` for unit isolation. Mock the `ConnectionStrategy` and `Conversation.create` to avoid the binary dependency in unit tests.
- **`__all__` discipline:** Only symbols listed in `__all__` are considered public API. The top-level `google/antigravity/__init__.py` is the canonical public surface.
- **Per-package READMEs:** `hooks/`, `tools/`, `connections/`, `conversation/`, and `triggers/` each have a `README.md` explaining their design and usage — read these before modifying those subsystems.
- **Skills docs:** `skills/` contains reference documentation for users of the SDK (not contributor guidelines).
