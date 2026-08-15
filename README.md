# Biomni (Anchored) — DeepSeek Harness Agent Preset

A publishable, installable [DeepSeek Harness](https://github.com/deepseek-harness/deepseek-harness) agent preset that wraps a locally deployed [Biomni](https://github.com/snap-stanford/Biomni) biomedical AI engine with the `Anchored Standard (experimental)` bootstrap.

The preset does **not** reimplement Biomni. It exposes the existing local engine through first-class DSH tools and keeps the complete local Biomni capability surface: the A1 agent, all 218 tool functions across 21 modules, the data lake, and know-how documents.

## Highlights

- **Anchored bootstrap preserved** — request #1 still sees only persistent `bash` + `str_replace_editor`; automatic instruction/skill injections stay suppressed.
- **Biomni core tools resident after promotion** — `biomni_status`, `biomni_tools`, `biomni_run`, `biomni_know_how`.
- **Full catalog on demand** — the live 218-tool / 21-module catalog is read from the installed `biomni` package, not hard-coded.
- **Gradio-first execution with direct fallback** — when `http://127.0.0.1:7860` is online, `biomni_run` uses the Gradio simple-call REST/SSE protocol with attachments and per-session history; otherwise it runs `run_biomni.py` directly.
- **Unlockable deep access** — `biomni_data` searches the 76-entry data lake and `biomni_python` executes arbitrary Python in `~/Biomni/.venv`.
- **Bundled skills** — `biomni-local-engine` documents this preset; `neonatal-cardiac-regeneration` carries the Thorp-lab Immunity 2025 workflow.

## Requirements

- DeepSeek Harness with agent presets enabled (a writable user preset root at `~/.dsh/.agent-presets`).
- A local Biomni deployment:
  - `~/Biomni/run_biomni.py`
  - `~/Biomni/.venv/bin/python`
  - `~/Biomni/.env` with a working LLM API configuration
  - optional but recommended: Gradio running on `127.0.0.1:7860`
- Node.js >= 20.6 for the preset plugins (the DSH host already satisfies this).

## Install

```bash
git clone https://github.com/your-org/biomni-anchored-preset.git
cd biomni-anchored-preset
./scripts/install.sh            # install to ~/.dsh/.agent-presets/biomni
./scripts/install.sh --force    # replace an existing installation
```

Or install manually:

```bash
mkdir -p ~/.dsh/.agent-presets/biomni
cp preset.yml agent.cordis.yml *.mjs biomni_bridge.py ~/.dsh/.agent-presets/biomni/
cp -R skills ~/.dsh/.agent-presets/biomni/
```

Then open DSH Web, create a new session, and select **Biomni (Anchored)** from the agent preset picker.

Uninstall:

```bash
./scripts/uninstall.sh
```

## Tool map

| Local Biomni capability | Preset tool |
| --- | --- |
| A1 agent end-to-end runs | `biomni_run` |
| Live tool catalog (218 tools / 21 modules) | `biomni_tools` |
| Engine and install status | `biomni_status` |
| Know-how documents | `biomni_know_how` |
| Data-lake descriptions and files | `biomni_data` (unlockable) |
| Direct `biomni.tool.*` function calls | `biomni_python` (unlockable) |

After the first promoted request, the resident catalog is:

`bash`, `str_replace_editor`, `dev_tool_search`, `skill_search`, `skill_load`,
`biomni_status`, `biomni_tools`, `biomni_run`, `biomni_know_how`

Everything else stays behind `dev_tool_search`, matching the Anchored Standard design.

## How this compares to using Gradio directly

Same engine, different surface:

- Gradio is a direct chat UI with live dual-pane streaming and multimodal upload.
- This preset routes biomedical work through a DSH agent. The model decides when to call `biomni_run`; the result arrives as a final snapshot report.
- Gradio-online runs use the same `/gradio_api/call/generate_response` protocol and preserve history per DSH session.
- Gradio-offline runs fall back to direct `run_biomni.py`, which is single-shot per call.

If you want the Gradio-like experience inside DSH Web, use the separate Biomni sidebar workbench instead of this agent preset.

## Configuration

The preset config is in `agent.cordis.yml`:

```yaml
- id: biomni-agent-tools
  name: ./biomni-agent-tools.mjs
  config:
    gradioBaseUrl: http://127.0.0.1:7860
    gradioApiPath: /gradio_api
    defaultTimeoutMs: 900000
    maxOutputChars: 60000
```

`biomniHome` defaults to `~/Biomni` and can be overridden with the `BIOMNI_HOME` environment variable. `gradioBaseUrl` can be overridden with `BIOMNI_GRADIO_URL`.

## Development

```bash
npm run check     # node --check every preset .mjs plugin
npm test          # unit tests with a mocked DSH context and Biomni bridge
npm run verify    # both
```

The tests do not require a real Biomni installation and run on plain Ubuntu in CI.

## Project layout

```text
.
├── agent.cordis.yml             # preset composition
├── preset.yml                   # display metadata
├── biomni-agent-tools.mjs       # six Biomni bridge tools
├── biomni_bridge.py             # JSON introspection bridge for the local Biomni package
├── tool-bootstrap.mjs           # Anchored bootstrap + residentTools
├── dev-tool-search.mjs          # on-demand tool discovery
├── skill-search.mjs             # on-demand skill discovery
├── instruction-hint.mjs         # post-promotion instruction-file hint
├── compaction-epoch.mjs         # epoch-aware promotion
├── custom-bash.mjs              # Windows bash fallback
├── skills/
│   ├── biomni-local-engine/
│   └── neonatal-cardiac-regeneration/
├── scripts/
│   ├── install.sh
│   ├── uninstall.sh
│   └── check-syntax.mjs
├── test/
├── .github/workflows/ci.yml
└── LICENSE
```

## License and attribution

This repository is MIT licensed. It does not contain Biomni source code; Biomni remains subject to its own license at [snap-stanford/Biomni](https://github.com/snap-stanford/Biomni).

The `neonatal-cardiac-regeneration` skill is derived from the Thorp lab workflow:
Lantz C, et al. "Early-age efferocytosis directs macrophage arachidonic acid metabolism for tissue regeneration." Immunity 2025;58(2):344-361.e7. PMID 39938482.
