# Biomni (Anchored) — DeepSeek Harness Agent 预设

可发布、可安装的 [DeepSeek Harness](https://github.com/deepseek-harness/deepseek-harness) agent preset：用 `Anchored Standard (experimental)` 启动逻辑包裹本机部署的 [Biomni](https://github.com/snap-stanford/Biomni) 生物医学引擎。

本工程不重新实现 Biomni，而是把本机已有的完整能力暴露为一组 DSH 工具：A1 agent、218 个工具（21 个模块）、数据湖、know-how 文档。

## 安装

```bash
git clone https://github.com/your-org/biomni-anchored-preset.git
cd biomni-anchored-preset
./scripts/install.sh            # 安装到 ~/.dsh/.agent-presets/biomni
./scripts/install.sh --force    # 覆盖安装
```

然后在 DSH Web 新建会话，选择 **Biomni (Anchored)**。

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

`biomniHome` 默认自动检测为 `~/Biomni`，可用 `BIOMNI_HOME` 环境变量覆盖；`gradioBaseUrl` 可用 `BIOMNI_GRADIO_URL` 覆盖。

## 开发与测试

```bash
npm run check
npm test
npm run verify
```

测试使用 mock DSH context，不需要真实 Biomni，可在 GitHub Actions 的 Ubuntu 环境运行。

## 许可

本仓库为 MIT。不包含 Biomni 源码；Biomni 遵循其上游许可。`neonatal-cardiac-regeneration` skill 来自 Thorp lab 工作流，详见 Immunity 2025 论文（PMID 39938482）。
