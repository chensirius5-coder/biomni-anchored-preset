# Architecture

```text
DSH agent session (Biomni Anchored preset)
  ├─ bootstrap filter        request #1: bash + str_replace_editor
  ├─ promotion tracker       durable session events -> promoted phase
  ├─ resident catalog        bash, editor, discovery tools, biomni core tools
  ├─ dev_tool_search         unlock biomni_data / biomni_python / standard tools
  ├─ skill_search            discover bundled skills
  └─ biomni-agent-tools.mjs
       ├─ Gradio REST/SSE     POST /gradio_api/call/generate_response
       │                        GET  /gradio_api/call/generate_response/:event_id
       │                        POST /gradio_api/upload
       ├─ direct fallback      ~/Biomni/.venv/bin/python run_biomni.py <task>
       └─ biomni_bridge.py     JSON: tools / data / knowhow / status
                                (reads the installed biomni package live)
```

## Invariants

- The first model request always sees exactly the two Minimal tools and no
  automatic instruction or skill-catalog injection.
- Promotion is durable and epoch-aware; compaction resets the phase until a
  new promotion signal.
- No Biomni capability is reimplemented: execution and introspection always
  go through the local Biomni installation.
- The preset degrades safely when Biomni is missing or offline: tools report
  status instead of crashing the session.

## Extension points

- `agent.cordis.yml` — add or disable rows.
- `tool-bootstrap.mjs` `residentTools` — change the promoted Biomni core set.
- `biomni-agent-tools.mjs` `resolveConfig()` — change default paths.
- `dev-tool-search.mjs` `UNLOCKABLE_INDEX` — advertise additional tools.
- `skills/` — add preset-local skills; they are discovered through
  `skill-filesystem` `customSkillDirs`.
