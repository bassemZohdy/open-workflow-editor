# Layout engine maintenance

Auto layout still uses ELK 0.12.0's layered algorithm with the same direction, routing, spacing, model order and placement strategies. `src/layoutGraph.ts` translates the SDK's flattened canvas graph; nested workflow tasks remain visible nodes. `scripts/elk/profile.json` is the layout configuration shared with the compiler.

The lazy `elk-layered` package is a private compiler profile for this editor. Its small GWT entry point adapts canvas nodes, ports and edges directly to upstream `LGraph`, calls `ElkLayered.doLayout`, and transfers coordinates and routing back. It avoids the general EMF graph model, algorithm registry and JSON metadata adapter. The upstream layered implementation is unchanged; its strategy factories retain the five phases used by the existing editor profile. This package is not a general ELK.js replacement. Changing the profile requires rebuilding; mismatched options fail explicitly.

## Provenance and validation

`vendor/elk-layered/provenance.json` records the exact official ELK.js and ELK source commits, released compiler dependencies, recipe hashes and artifact checksum. The ELK API is pinned to the same version. CI and `prebuild` verify these hashes. The upstream EPL-2.0 / GPL-3.0 license notice accompanies the generated artifact; the adapter source and rebuild recipe are included here.

`src/layoutEngine.test.ts` compares every graph and layout field against the unmodified npm engine, excluding only GWT's process-local `$H` identity hash. Cases include all shipped workflows and templates, nested semantic tasks, forks/joins, cycles, self-loops, explicit ports, disconnected nodes and deterministic generated graphs. Tests also verify the editor's returned positions and reject profile drift.

The existing size check still sums **every** production `dist/assets/*.js` file, including the lazy engine, using the same Brotli settings and **500 kB** limit. No assets are excluded or moved outside the budget. Coverage thresholds remain 80% for every metric.

## Rebuild or upgrade

Install Git, Node.js and JDK 17. Set `ELK_JAVA` to the JDK 17 `java` executable if the default Java differs. Run:

```sh
npm run layout:build
npm install --package-lock-only
npm ci
npm run layout:verify
npm test
npm run test:coverage
npm run test:browser
npm run build
npm run size
```

The recipe checks out pinned sources in a new temporary directory and compiles with Gradle 7.6.4 and GWT 2.11.0. `ELK_GRADLE_CACHE` can specify a reusable compiler cache. Normal installs and CI consume the checked-in artifact and do not require Java or Gradle.

The private package version follows the artifact/provenance contents. npm packages this local dependency using `install-links=true`, so installed upstream code receives the same coverage treatment as other third-party dependencies. The application coverage configuration and thresholds are unchanged.

For an upgrade, change both source commits and the exact `elkjs` version together, review upstream importer/transferrer and strategy changes, rebuild the artifact, and run all checks above. Review parity failures before accepting the artifact. Keep source patches explicit and retain the aggregate bundle gate.

Official references: [ELK.js build instructions](https://github.com/kieler/elkjs/tree/0.12.0#building), [ELK layered implementation](https://github.com/eclipse-elk/elk/tree/v0.12.0/plugins/org.eclipse.elk.alg.layered), [ELK.js compiler configuration](https://github.com/kieler/elkjs/blob/0.12.0/build.gradle).
