# AI task families — composition & components

Task 16 ships AI authoring today **without inventing new DSL keys**. Open Workflow 1.0.3 does not accept `llm-call` / `ai-agent-call` task types, so the editor composes them from the most suitable valid primitives:

> **Sub-flow delegation** (`run.workflow` → `ai` namespace) as the primary mechanism, with a **catalog-backed provider** (`use.catalogs`) inside the sub-flow and a **runnable script contract** that production runtimes replace with the provider bridge.

## How it works

| Piece                                                      | What it is                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Palette entries** (`LLM call` ◈, `AI agent call` ◮)      | No longer "coming soon". Adding one inserts a **delegation task** at the end of `do` — a valid `run.workflow` targeting `ai/prompt-llm@0.1.0` or `ai/ai-agent@0.1.0` — and automatically scaffolds the AI sub-flow in a new tab.                                       |
| **AI sub-flows** (`workflowModel.createAiSubflowDocument`) | Schema-valid documents: `use.catalogs` (`ai-providers` / `agents` entries) + two tasks — `invokeLlm`/`runAgent` (a `run.script` contract stub) → `captureResult` (`set` mapping). The demo engine executes the stubs; the contract is documented in the script itself. |
| **AI inspection** (`AiTaskCard`)                           | Shown in the Inspector whenever a `run` task targets the `ai` namespace: explains the composition, shows the target, and offers one-click open/scaffold of the sub-flow.                                                                                               |
| **Canvas styling**                                         | AI-delegated nodes render magenta with `ai: <subflow-name>` subtitle and `◈`/`◮` icons (detected via `taskMeta.isAiDelegation`).                                                                                                                                       |
| **Template**                                               | `ai-orchestration` catalog pattern: captures request → delegates to both AI sub-flows → maps outcomes → emits an event.                                                                                                                                                |
| **Provider bridge**                                        | `server/aiProviderBridge.js` — reference adapter (`chat` / `runAgent`) with request validation, server-side key handling and 64 KiB limits. Production runtimes wire real providers here instead of the stub scripts.                                                  |

## Contracts

- `invokeLlm(prompt, model)` reads `catalogs['ai-providers'].endpoint`, returns `{ completion, model, usage, toolCalls }`.
- `runAgent(goal, tools)` reads `catalogs.agents.endpoint`, returns `{ steps, outcome }`.
- Provider keys **never** leave the server (`AI_PROVIDER_API_KEY`); the browser only carries prompt/model/goal data.

## Enabling notes

- The delegation task is a plain `run.workflow` — any runtime that supports sub-flows runs it as-is.
- Until a provider bridge is wired, the sub-flow stubs produce deterministic mock results (`[mock-llm] …`, `[mock-agent] …`) so the demo engine can validate the whole orchestration.
- If the Open Workflow spec later adds native AI task types, the composition stays valid; native types would only add a second (schema-valid) representation.

## Files

- Builder/contracts: `src/workflowModel.ts` (`AI_TASK_SPECS`, `createAiSubflowDocument`, `addTopLevelAiTask`), `src/scriptContract.ts` (`AI_LLM_SCRIPT`, `AI_AGENT_SCRIPT`)
- UI: `src/components/inspector/AiTaskCard.tsx`, `src/taskMeta.ts` (AI delegation styling), `src/main.tsx` (add + scaffold flow), `src/fixtures/templates.ts` (`ai-orchestration`)
- Server: `server/aiProviderBridge.js`
- Tests: `src/workflowModel.test.ts` (AI suites), `tests/ide-parity.spec.js` (palette flow + template)
