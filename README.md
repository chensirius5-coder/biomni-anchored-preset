# Biomni (Anchored) — DeepSeek Harness Agent Preset / Agent 预设

[中文](#中文) · [English](#english)

A DeepSeek Harness agent preset that wraps the local Biomni biomedical AI engine with the Anchored Standard (experimental) bootstrap. The same page is provided in both languages.

---

## 中文

可发布、可安装的 [DeepSeek Harness](https://github.com/deepseek-harness/deepseek-harness) agent preset：用 `Anchored Standard (experimental)` 启动逻辑包裹本机部署的 [Biomni](https://github.com/snap-stanford/Biomni) 生物医学引擎。

本工程不重新实现 Biomni，而是把已有的完整能力暴露为一组 DSH 工具：A1 agent、218 个工具（21 个模块）、数据湖、know-how 文档。

## 安装

```bash
git clone https://github.com/your-org/biomni-anchored-preset.git
cd biomni-anchored-preset

# 1. 先引导安装 Biomni 引擎（默认 ~/Biomni）
./scripts/setup-biomni.sh

# 2. 再安装本 preset
./scripts/install.sh            # 安装到 ~/.dsh/.agent-presets/biomni
./scripts/install.sh --force    # 覆盖安装
```

引导完成后编辑 `~/Biomni/.env` 填入 LLM API Key。数据湖约 11 GB，按需单独下载：

```bash
~/Biomni/.venv/bin/python ~/Biomni/run_biomni.py --download-datalake "list data lake files"
```

然后在 DSH Web 新建会话，选择 **Biomni (Anchored)**。

> 本仓库不包含 Biomni Python 包、虚拟环境、约 11 GB 数据湖和任何 API Key；这些属于用户本地安装和隐私配置。

卸载：

```bash
./scripts/uninstall.sh
```

## 能力映射

| 本机 Biomni 能力 | preset 工具 |
| --- | --- |
| A1 agent 全流程 | `biomni_run` |
| 实时工具目录（218 tools / 21 modules） | `biomni_tools` |
| 引擎/安装状态 | `biomni_status` |
| know-how | `biomni_know_how` |
| 数据湖 | `biomni_data`（按需解锁） |
| 任意 `biomni.tool.*` 直接调用 | `biomni_python`（按需解锁） |

## Anchored 行为

- 首请求仍只有 `bash` + `str_replace_editor`，并抑制自动注入的指令与技能目录。
- promotion 后常驻：`biomni_status`、`biomni_tools`、`biomni_run`、`biomni_know_how`。
- 其余工具继续走 `dev_tool_search` 按需解锁。

## 与 Gradio 直接使用的区别

能力相同，交互不同。Gradio 是直接对话 + 双栏流式 + 文件上传；本 preset 是 DSH agent 编排 Biomni，模型决定何时调用 `biomni_run`，结果以最终 snapshot 报告返回。Gradio 在线时走同一套 `/gradio_api/call/generate_response`，离线时退回 direct 模式。

## 配置

Gradio 是可选的：`biomni_run` 默认探测 `http://127.0.0.1:7860`，离线、缺失或禁用时自动退回 direct 模式。其他用户如果没有本地 Gradio，不需要做任何配置即可使用。

- `biomniHome` 默认自动检测为 `~/Biomni`，可用 `BIOMNI_HOME` 覆盖。
- `gradioBaseUrl` 默认 `http://127.0.0.1:7860`；远程服务用 `BIOMNI_GRADIO_URL=http://host:port` 指定。
- 想完全跳过 Gradio 探测，设置 `BIOMNI_GRADIO_URL=disabled`，`biomni_run` 将始终使用 direct 模式。

## 开发与测试

```bash
npm run check
npm test
npm run verify
```

测试使用 mock DSH context，不需要真实 Biomni，可在 GitHub Actions 的 Ubuntu 环境运行。

## 许可

本仓库为 MIT。不包含 Biomni 源码；Biomni 遵循其上游许可。`neonatal-cardiac-regeneration` skill 来自 Thorp lab 工作流，详见 Immunity 2025 论文（PMID 39938482）。

---

## English

A publishable, installable [DeepSeek Harness](https://github.com/deepseek-harness/deepseek-harness) agent preset that wraps a locally deployed [Biomni](https://github.com/snap-stanford/Biomni) biomedical AI engine with the `Anchored Standard (experimental)` bootstrap.

The preset does **not** reimplement Biomni. It exposes the existing local engine through first-class DSH tools and keeps the complete local Biomni capability surface: the A1 agent, all 218 tool functions across 21 modules, the data lake, and know-how documents.

## Highlights

- **Anchored bootstrap preserved** — request #1 still sees only persistent `bash` + `str_replace_editor`; automatic instruction/skill injections stay suppressed.
- **Biomni core tools resident after promotion** — `biomni_status`, `biomni_tools`, `biomni_run`, `biomni_know_how`.
- **Full catalog on demand** — the live 218-tool / 21-module catalog is read from the installed `biomni` package, not hard-coded.
- **Gradio optional, direct fallback always available** — auto mode probes the configured Gradio URL and falls back to `run_biomni.py` when that service is absent. No Gradio process is required for other users.
- **Unlockable deep access** — `biomni_data` searches the 76-entry data lake and `biomni_python` executes arbitrary Python in `~/Biomni/.venv`.
- **Bundled skills** — `biomni-local-engine` documents this preset; `neonatal-cardiac-regeneration` carries the Thorp-lab Immunity 2025 workflow.

## Requirements

- DeepSeek Harness with agent presets enabled (a writable user preset root at `~/.dsh/.agent-presets`).
- A local Biomni engine. The repository intentionally does **not** include
  Biomni itself, its Python virtualenv, its ~11 GB data lake, or API keys.
  Use the provided bootstrap:
  ```bash
  ./scripts/setup-biomni.sh
  ```
  This installs the `biomni` package, creates `~/Biomni/.venv`, copies the
  portable launcher and `env.example`. The data lake is downloaded separately
  and only when you opt in.
- Node.js >= 20.6 for the preset plugins (the DSH host already satisfies this).

## Install

```bash
git clone https://github.com/your-org/biomni-anchored-preset.git
cd biomni-anchored-preset

# 1. Bootstrap the Biomni engine (~/Biomni by default)
./scripts/setup-biomni.sh

# 2. Install this preset
./scripts/install.sh            # install to ~/.dsh/.agent-presets/biomni
./scripts/install.sh --force    # replace an existing installation
```

After the bootstrap, edit `~/Biomni/.env` with the LLM API key. The data lake
is optional; fetch it once when needed:

```bash
~/Biomni/.venv/bin/python ~/Biomni/run_biomni.py --download-datalake "list data lake files"
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
    # Gradio URL is optional; the default is http://127.0.0.1:7860
    # gradioBaseUrl: http://127.0.0.1:7860
    gradioApiPath: /gradio_api
    defaultTimeoutMs: 900000
    maxOutputChars: 60000
```

- `biomniHome` defaults to `~/Biomni`; override with `BIOMNI_HOME`.
- `gradioBaseUrl` defaults to `http://127.0.0.1:7860`; override with
  `BIOMNI_GRADIO_URL` for a remote service, or set it to `disabled` to skip
  probing and always use direct mode.
- When Gradio is missing, offline, or disabled, `biomni_run` automatically
  uses direct mode, so a clean Biomni installation without Gradio works too.

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
├── env.example                   # copy to ~/Biomni/.env and edit
├── scripts/
│   ├── setup-biomni.sh           # bootstrap Biomni package + launcher + .env
│   ├── run_biomni.py             # portable provider-neutral Biomni launcher
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
