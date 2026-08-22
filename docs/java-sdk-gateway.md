# Open Workflow Java SDK (7.x) Gateway Integration

## Overview

The Open Workflow Editor provides native integration with production **Open Workflow Java SDK (7.x)** daemons. This architecture enables enterprise workflows authored in the visual React canvas to execute on high-performance Java virtual machines with transactional consistency, persistence, and audit capabilities.

---

## 1. Maven Dependency Configuration

Add the Open Workflow Java SDK engine dependency to your `pom.xml`:

```xml
<dependency>
    <groupId>io.openworkflow</groupId>
    <artifactId>openworkflow-engine</artifactId>
    <version>7.4.2</version>
</dependency>
<dependency>
    <groupId>io.openworkflow</groupId>
    <artifactId>openworkflow-gateway-spring-boot-starter</artifactId>
    <version>7.4.2</version>
</dependency>
```

---

## 2. Spring Boot Gateway Controller Configuration

Configure your Spring Boot application properties (`application.yml`):

```yaml
server:
  port: 8091

openworkflow:
  gateway:
    enabled: true
    auth:
      bearer-token: ${OPENWORKFLOW_GATEWAY_TOKEN:secret-gateway-token}
    rate-limit:
      requests-per-minute: 200
    telemetry:
      sse-enabled: true
      log-buffer-size: 5000
```

---

## 3. Java Runtime Service Implementation

```java
package ae.dubai.smartservices.workflow;

import io.openworkflow.engine.WorkflowEngine;
import io.openworkflow.engine.model.WorkflowDefinition;
import io.openworkflow.engine.runtime.WorkflowInstance;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@RestController
@RequestMapping("/runs")
@CrossOrigin(origins = "*")
public class WorkflowGatewayController {

    private final WorkflowEngine workflowEngine;

    public WorkflowGatewayController(WorkflowEngine workflowEngine) {
        this.workflowEngine = workflowEngine;
    }

    @PostMapping
    public ResponseEntity<?> startRun(@RequestBody Map<String, Object> payload) {
        WorkflowDefinition spec = WorkflowDefinition.fromMap(payload.get("workflow"));
        WorkflowInstance instance = workflowEngine.start(spec, (Map<String, Object>) payload.get("inputs"));
        return ResponseEntity.status(201).body(instance.toStatusMap());
    }

    @GetMapping("/{id}/events")
    public SseEmitter streamEvents(@PathVariable String id) {
        SseEmitter emitter = new SseEmitter(120_000L);
        workflowEngine.subscribe(id, event -> {
            try {
                emitter.send(SseEmitter.event().name(event.getType()).data(event.getData()));
                if (event.isTerminal()) emitter.complete();
            } catch (Exception ex) {
                emitter.completeWithError(ex);
            }
        });
        return emitter;
    }
}
```

---

## 4. Connecting the Editor to the Java Gateway

1. Launch your Java execution daemon on `http://127.0.0.1:8091`.
2. In the Open Workflow Editor, open the **Runtime Panel** on the right rail.
3. Switch the tab from **Demo engine** to **Runtime gateway**.
4. Click **▸ Gateway settings** to set:
   - **Gateway Base URL**: `http://127.0.0.1:8091`
   - **Bearer Token**: `secret-gateway-token`
5. The live health card will immediately turn green: `● Gateway Online (3ms)`.
6. Click **Start run** to trigger Java SDK execution with real-time SSE telemetry!
