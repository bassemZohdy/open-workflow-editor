export const COMPLEX_WORKFLOW = `document:
  dsl: "1.0.3"
  namespace: editor-fixtures
  name: branching-release
  version: "1.0.0"
  metadata:
    owner: platform
do:
  - prepare:
      set:
        ready: true
      timeout: PT10S
  - decide:
      switch:
        - approved:
            when: "\${ $context.ready == true }"
            then: notify
        - fallback:
            then: continue
  - notify:
      do:
        - send:
            call: http
            with:
              method: post
              endpoint: https://example.com/release
`;
