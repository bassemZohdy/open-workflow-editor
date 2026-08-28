# Runtime selection decision

## Decision

Use the Open Workflow Specification Java SDK reference implementation (7.x line) as the first execution target, exposed through a server-side gateway. The browser editor will call the gateway through the existing runtime adapter contract; it will never contain the Java runtime, runtime credentials, or endpoint secrets.

The gateway must pin a compatible SDK/runtime version and reject unsupported workflow DSL versions during `validate`. The editor currently emits 1.0.x documents, so compatibility with the selected runtime is an integration acceptance test, not an assumption.

## Why this target

- The Open Workflow Specification project lists the Java SDK reference implementation as a runtime and describes it as fully compliant.
- The Java SDK provides a reference execution engine while keeping the editor independent of a JVM deployment model.
- A server-side gateway gives the application a stable place for authentication, credential resolution, endpoint policy, redaction, cancellation authorization, and audit logging.
- The adapter contract remains runtime-neutral, so a later move to Apache KIE SonataFlow does not change the editor’s document or canvas model.

## Alternatives considered

Apache KIE SonataFlow is a strong production-oriented alternative with REST/AsyncAPI orchestration, persistence, monitoring, and deployment tooling. Its current support documentation describes Serverless Workflow 0.8 support in the relevant feature matrix, so it is not the first target for this editor’s 1.0.x documents without a compatibility proof or translation layer.

The Go SDK reference implementation is useful for embedded execution and tests, but its published feature matrix is partial and does not cover the editor’s full task palette. Lemline and Synapse remain ecosystem options, but neither is selected until an authenticated gateway API and 1.0.x conformance evidence are available.

## Required integration gate

Before enabling a run panel:

1. Build a server-side gateway around the selected Java runtime.
2. Prove validation and execution for every task type the editor can author, or narrow the editor’s runnable subset explicitly.
3. Add authenticated `validate`, `start`, `status`, `cancel`, and `logs` endpoints matching `src/runtimeAdapter.ts`.
4. Complete the security review for secrets, endpoints, expressions, logs, and cancellation authorization.

Sources:

- [Open Workflow Specification ecosystem](https://github.com/open-workflow-specification/specification#ecosystem)
- [Java SDK reference implementation](https://github.com/open-workflow-specification/sdk-java)
- [SonataFlow specification support](https://kie.apache.org/docs/10.1.x/sonataflow/serverlessworkflow/latest/core/cncf-serverless-workflow-specification-support.html)
