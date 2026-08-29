# AI task families — composition & components

Task 16 ships AI authoring today **without inventing new DSL keys**. Open Workflow 1.0.3 does not accept `llm-call` / `ai-agent-call` task types, so the editor composes them from the most suitable valid primitives:

> **Sub-flow delegation** (`run.workflow` → `ai` namespace) as the primary mechanism, with a **catalog-backed provider** (`use.catalogs`) inside the sub-flow and a **runnable script contract** that production runtimes replace with the provider bridge.

## Component registry (Tasks 105–108)

All AI components are declared as data in `src/ai/registry.ts` — the single source of truth. Each entry specifies: kind, label, icon, sub-flow identity (namespace/name/version), catalog descriptor, script contract, and demo-engine mock recipe. Adding a new AI component = one registry entry + tests; nothing else branches on specific kinds.

**Current components:**

| Kind              | Label           | Sub-flow                   | Catalog        | Extension mechanisms            |
| ----------------- | --------------- | -------------------------- | -------------- | ------------------------------- |
| `llm-call`        | LLM call        | `ai/prompt-llm@0.1.0`      | `ai-providers` | catalogs + subflows             |
| `ai-agent-call`   | AI agent call   | `ai/ai-agent@0.1.0`        | `agents`       | catalogs + subflows             |
| `text-classifier` | Text classifier | `ai/text-classifier@0.1.0` | `ai-providers` | catalogs + subflows + functions |
| `text-summarizer` | Text summarizer | `ai/text-summarizer@0.1.0` | `ai-providers` | catalogs + subflows             |

**Catalog descriptors:** each component declares a typed `AiCatalogDescriptor` (`catalogKey` + `endpoint`) — `createAiSubflowDocument` writes `use.catalogs` from the descriptor; the demo engine's mock recipes are keyed off the component's catalog shape. Settings-level provider config (Task 88) consumes the same descriptors.

**Migration readiness:** registry entries carry `kind` identifiers that map 1:1 to future native keys; `createAiSubflowDocument` metadata includes `kind` for mechanical detection. When the spec defines native AI task types, `migrateAiDelegations` (`src/ai/migration.ts`) rewrites `run.workflow → ai/*` delegations to native keys — the registry foundation makes this trivial.

## How it works

| Piece                                                                                           | What it is                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Palette entries** (`LLM call` ◈, `AI agent call` ◮, `Text classifier` ❖, `Text summarizer` ≡) | No longer "coming soon". Adding one inserts a **delegation task** at the end of `do` — a valid `run.workflow` targeting the component's sub-flow — and automatically scaffolds the AI sub-flow in a new tab. All 4 components are data-driven from the registry.                                           |
| **AI sub-flows** (`workflowModel.createAiSubflowDocument`)                                      | Schema-valid documents: `use.catalogs` (provider entries) + a script contract task → `captureResult` (`set` mapping). The demo engine executes the stubs; the contract is documented in the script itself.                                                                                                 |
| **AI inspection** (`AiTaskCard`)                                                                | Shown in the Inspector whenever a `run` task targets the `ai` namespace: explains the composition, shows the target, and offers one-click open/scaffold of the sub-flow.                                                                                                                                   |
| **Canvas styling**                                                                              | AI-delegated nodes render magenta with `ai: <subflow-name>` subtitle and component-specific icons (detected via `taskMeta.isAiDelegation` + registry lookup).                                                                                                                                              |
| **Template**                                                                                    | `ai-orchestration` catalog pattern: captures request → delegates to both AI sub-flows → maps outcomes → emits an event.                                                                                                                                                                                    |
| **Provider bridge**                                                                             | `server/aiProviderBridge.js` — reference adapter (`chat` / `runAgent`) with request validation, server-side key handling and 64 KiB limits.                                                                                                                                                                |
| **Gateway endpoints**                                                                           | The runtime gateway (`server/runtimeGatewayHandler.js`) serves `POST /ai/chat` and `POST /ai/agent` through the bridge with the same envelope as the runtime routes (Bearer auth, sliding-window rate limit, audit entries). `503` when unconfigured, `502` on provider errors, `400` on invalid payloads. |

## Contracts

- `invokeLlm(prompt, model)` reads `catalogs['ai-providers'].endpoint`, returns `{ completion, model, usage, toolCalls }`.
- `runAgent(goal, tools)` reads `catalogs.agents.endpoint`, returns `{ steps, outcome }`.
- Provider keys **never** leave the server (`AI_PROVIDER_API_KEY`, injectable `aiProviderConfig` on the gateway handler); the browser only carries prompt/model/goal data.

## Enabling notes

- The delegation task is a plain `run.workflow` — any runtime that supports sub-flows runs it as-is.
- **Deployment bundle:** `findSubflowDelegations` scans the workflow (incl. nested containers) for every `run.workflow` delegation, then ships a runnable `subflows/<namespace>/<name>.yaml` per referenced sub-flow. Workspace documents matching `namespace`+`name` (open tabs or saved workflows) are shipped verbatim — so your edited AI sub-flows win over the canonical builder, which is only a fallback. Wiring: `COPY subflows/ /app/subflows/`, ConfigMap keys with `items`/`subPath` mounts, `WORKFLOW_SUBFLOW_PATH=/app/subflows`, README section (incl. an "Unresolved sub-flow references" list when a target has no document and no built-in contract).
- **Demo engine:** AI delegation without a workspace document is simulated with contract-shaped results (`[mock-llm] …` / `[mock-agent] …` / `[mock-classify] …` / `[mock-summarize] …`); the output merges into context under the task name, so parent mapping steps resolve end-to-end. When a matching AI sub-flow document exists in the workspace, the demo engine executes that document instead.
- Until a provider key is configured, the gateway returns `503` and the sub-flow stubs produce deterministic mock results so the demo engine can validate the whole orchestration.
- If the Open Workflow spec later adds native AI task types, the composition stays valid; native types would only add a second (schema-valid) representation.

## Files

- Registry: `src/ai/registry.ts` (component definitions), `src/ai/migration.ts` (native-key migration kit)
- Builder/contracts: `src/workflowModel.ts` (`createAiSubflowDocument`, `addTopLevelAiTask`), `src/scriptContract.ts` (`AI_LLM_SCRIPT`, `AI_AGENT_SCRIPT`, `AI_TEXT_CLASSIFIER_SCRIPT`, `AI_TEXT_SUMMARIZER_SCRIPT`)
- UI: `src/components/inspector/AiTaskCard.tsx`, `src/taskMeta.ts` (AI delegation styling), `src/main.tsx` (add + scaffold flow), `src/fixtures/templates.ts` (`ai-orchestration`)
- Server: `server/aiProviderBridge.js`, `server/runtimeGatewayHandler.js` (`/ai/chat`, `/ai/agent`)
- Tests: `src/ai/registry.test.ts`, `src/ai/migration.test.ts`, `src/workflowModel.test.ts`, `tests/ide-parity.spec.js`
