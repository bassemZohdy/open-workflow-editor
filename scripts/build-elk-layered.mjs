import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'vendor/elk-layered');
const sourceFiles = ['scripts/build-elk-layered.mjs', 'scripts/elk/ElkJs.java', 'scripts/elk/profile.json'];
const sources = {
  elkjs: { url: 'https://github.com/kieler/elkjs.git', commit: 'ff5771d7165445c42c408bb8a090c8035272218c' },
  elk: { url: 'https://github.com/eclipse-elk/elk.git', commit: '323312916048544e4e594eab3303cdb0d01e2929' },
};
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const run = (command, args, cwd, capture = false) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || ''}`);
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
};

const java = process.env.ELK_JAVA || 'java';
if (!/version "17[.\"]/.test(run(java, ['-version'], root, true))) {
  throw new Error('ELK 0.12.0 requires JDK 17. Set ELK_JAVA to its java executable.');
}
const workspace = mkdtempSync(join(tmpdir(), 'editor-elk-'));
console.log(`Pinned ELK build workspace: ${workspace}`);
for (const [name, source] of Object.entries(sources)) {
  const checkout = join(workspace, name);
  mkdirSync(checkout);
  run('git', ['init', '--quiet'], checkout);
  run('git', ['fetch', '--depth=1', source.url, source.commit], checkout);
  run('git', ['checkout', '--detach', '--quiet', 'FETCH_HEAD'], checkout);
  if (run('git', ['rev-parse', 'HEAD'], checkout, true) !== source.commit) throw new Error('Source mismatch');
}

const elkjs = join(workspace, 'elkjs');
const layered = join(workspace, 'elk/plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered');
const profile = JSON.parse(readFileSync(join(root, 'scripts/elk/profile.json'), 'utf8'));
const enumFields = [
  ['elk.direction', 'DIRECTION', 'Direction'],
  ['elk.edgeRouting', 'EDGE_ROUTING', 'EdgeRouting'],
  ['elk.layered.nodePlacement.strategy', 'NODE_PLACEMENT_STRATEGY', 'NodePlacementStrategy'],
  [
    'elk.layered.crossingMinimization.strategy',
    'CROSSING_MINIMIZATION_STRATEGY',
    'CrossingMinimizationStrategy',
  ],
  ['elk.layered.considerModelOrder.strategy', 'CONSIDER_MODEL_ORDER_STRATEGY', 'OrderingStrategy'],
];
const spacingFields = [
  ['elk.spacing.nodeNode', 'SPACING_NODE_NODE'],
  ['elk.layered.spacing.nodeNodeBetweenLayers', 'SPACING_NODE_NODE_BETWEEN_LAYERS'],
  ['elk.layered.spacing.edgeNodeBetweenLayers', 'SPACING_EDGE_NODE_BETWEEN_LAYERS'],
];
if (
  profile['elk.algorithm'] !== 'layered' ||
  profile['elk.edgeRouting'] !== 'ORTHOGONAL' ||
  profile['elk.layered.nodePlacement.strategy'] !== 'NETWORK_SIMPLEX' ||
  profile['elk.layered.crossingMinimization.strategy'] !== 'LAYER_SWEEP'
) {
  throw new Error('Update the compiler strategy factories before changing the editor profile.');
}
const javaOptions = enumFields.map(([key, field, type]) => {
  if (!/^[A-Z_]+$/.test(profile[key])) throw new Error(`Invalid enum: ${key}`);
  return `graph.setProperty(LayeredOptions.${field}, ${type}.${profile[key]});`;
});
for (const [key, field] of spacingFields) {
  const value = Number(profile[key]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid spacing: ${key}`);
  javaOptions.push(`graph.setProperty(LayeredOptions.${field}, ${value.toFixed(1)});`);
}
const padding = /^\[top=(\d+),left=(\d+),bottom=(\d+),right=(\d+)\]$/.exec(profile['elk.padding']);
if (!padding) throw new Error('Unsupported padding format');
const [, top, left, bottom, right] = padding;
const paddingExpression = `new ElkPadding(${top}.0, ${right}.0, ${bottom}.0, ${left}.0)`;
javaOptions.push(`graph.setProperty(LayeredOptions.PADDING, ${paddingExpression});`);
javaOptions.push(`graph.getPadding().add(${paddingExpression});`);
const entryPoint = readFileSync(join(root, 'scripts/elk/ElkJs.java'), 'utf8')
  .replace("'__EDITOR_PROFILE__'", JSON.stringify(profile))
  .replace('// EDITOR_JAVA_OPTIONS', javaOptions.join('\n        '));
writeFileSync(join(elkjs, 'src/java/org/eclipse/elk/js/ElkJs.java'), entryPoint);

// Retain the upstream implementations and defaults for the editor's five phases.
for (const [file, strategy, expression] of [
  ['options/NodePlacementStrategy.java', 'NETWORK_SIMPLEX', 'new NetworkSimplexPlacer()'],
  ['options/LayeringStrategy.java', 'NETWORK_SIMPLEX', 'new NetworkSimplexLayerer()'],
  ['options/CycleBreakingStrategy.java', 'GREEDY', 'new GreedyCycleBreaker()'],
  [
    'options/CrossingMinimizationStrategy.java',
    'LAYER_SWEEP',
    'new LayerSweepCrossingMinimizer(CrossMinType.BARYCENTER)',
  ],
]) {
  const filePath = join(layered, file);
  const source = readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n');
  const start = source.indexOf('        switch (this) {');
  if (start === -1 || !source.includes(`return ${expression};`))
    throw new Error(`Upstream factory changed: ${file}`);
  writeFileSync(
    filePath,
    `${source.slice(0, start)}        if (this != ${strategy}) {
            throw new IllegalArgumentException("Unsupported editor layout strategy: " + this);
        }
        return ${expression};
    }
}
`,
  );
}
const routerPath = join(layered, 'p5edges/EdgeRouterFactory.java');
const router = readFileSync(routerPath, 'utf8').replaceAll('\r\n', '\n');
const switchStart = router.indexOf('        switch (edgeRoutingStrategy) {');
if (switchStart === -1) throw new Error('Upstream edge router changed');
writeFileSync(
  routerPath,
  `${router.slice(0, switchStart)}        if (edgeRoutingStrategy != EdgeRouting.ORTHOGONAL) {
            throw new IllegalArgumentException("Unsupported editor routing: " + edgeRoutingStrategy);
        }
        return new OrthogonalEdgeRouter();
    }
}
`,
);

const gradlePath = join(elkjs, 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8')
  .replaceAll('\r\n', '\n')
  .replace("melk:   '0.12.0-SNAPSHOT'", "melk:   '0.12.0'")
  .replace('jcenter()', 'mavenCentral()');
gradle = gradle.replace(
  /  "\$\{elkRepo\}\/plugins\/org\.eclipse\.elk\.alg\.(force|mrtree|rectpacking|radial|spore)\/src",?\n/g,
  '',
);
// All dependencies are released versions from Maven Central.
gradle = gradle.replace(/    \/\/ for melk compiler\n    maven \{[^}]*\}\n/, '');
writeFileSync(gradlePath, gradle);
const wrapperPath = join(elkjs, 'gradle/wrapper/gradle-wrapper.properties');
writeFileSync(
  wrapperPath,
  readFileSync(wrapperPath, 'utf8').replace('gradle-7.2-bin', 'gradle-7.6.4-bin') +
    '\ndistributionSha256Sum=bed1da33cca0f557ab13691c77f38bb67388119e4794d113e051039b80af9bb1\n',
);
run(
  java,
  [
    '-Dorg.gradle.appname=gradlew',
    '-classpath',
    join(elkjs, 'gradle/wrapper/gradle-wrapper.jar'),
    'org.gradle.wrapper.GradleWrapperMain',
    '--no-daemon',
    '--gradle-user-home',
    process.env.ELK_GRADLE_CACHE || join(workspace, 'gradle-cache'),
    'copyMinified',
  ],
  elkjs,
);
mkdirSync(vendor, { recursive: true });
copyFileSync(join(elkjs, 'build/js/elk-worker.min.js'), join(vendor, 'elk-worker.cjs'));
writeFileSync(
  join(vendor, 'LICENSE.md'),
  readFileSync(join(elkjs, 'LICENSE.md'), 'utf8').replaceAll('\r\n', '\n'),
);
writeFileSync(
  join(vendor, 'provenance.json'),
  `${JSON.stringify(
    {
      version: '0.12.0',
      sources,
      compiler: { java: 17, gradle: '7.6.4', gwt: '2.11.0', melk: '0.12.0' },
      artifactSha256: sha256(join(vendor, 'elk-worker.cjs')),
      recipeSha256: Object.fromEntries(
        sourceFiles.map((file) => [
          file,
          createHash('sha256')
            .update(readFileSync(join(root, file), 'utf8').replaceAll('\r\n', '\n'))
            .digest('hex'),
        ]),
      ),
    },
    null,
    2,
  )}\n`,
);
// A content-derived private version makes npm refresh the packaged file dependency.
const pkgPath = join(vendor, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const stamp = createHash('sha256')
  .update(readFileSync(join(vendor, 'provenance.json')))
  .update(readFileSync(join(vendor, 'index.d.ts')))
  .update(readFileSync(join(vendor, 'LICENSE.md')))
  .digest('hex')
  .slice(0, 12);
pkg.version = `0.12.0-editor.h${stamp}`;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('Compiled artifact and provenance updated. Run parity, coverage, browser and bundle checks.');
