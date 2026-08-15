---
name: biomni-local-engine
description: 使用本机部署的 Biomni 生物医学引擎（~/Biomni，Gradio 7860 + Python 栈）。覆盖 biomni_run 委托执行、218 个工具目录检索、数据湖检索、know-how 读取、直接 Python 调用、GEO/scRNA-seq/影像/化学信息学/基因组学等 21 个模块。
whenToUse: 任务属于生物医学/生物信息学分析，或需要调用 Biomni 的 218 个领域工具与本地数据湖时。
---

# Biomni Local Engine Skill

## 1. 这个 preset 是什么

`biomni` preset 以 `Anchored Standard (experimental)` 为底座：
- 每个会话的第一个请求仍只看到 Minimal 工具对（`bash` + `str_replace_editor`），保持首请求轨迹锚定；
- promotion 后常驻 `biomni_status`、`biomni_tools`、`biomni_run`、`biomni_know_how`；
- `biomni_data` 与 `biomni_python` 按需用 `dev_tool_search` 解锁；
- 其余 Standard 能力（web、subagent、workflow 等）仍通过 `dev_tool_search` 解锁。

本 skill 只描述 Biomni 本地引擎的使用方式。不要在没有 Biomni 工具时会话里假设这些工具存在。

## 2. 本地引擎事实

| 项目 | 路径 / 值 |
| --- | --- |
| Biomni 根目录 | `~/Biomni` |
| 启动脚本 | `~/Biomni/run_biomni.py` |
| 虚拟环境 Python | `~/Biomni/.venv/bin/python` |
| Gradio UI / API | `http://127.0.0.1:7860` |
| Gradio API 前缀 | `/gradio_api` |
| 访问码 | `Biomni2025` |
| 数据湖 | `~/Biomni/data/biomni_data/data_lake` |
| 环境变量 | `~/Biomni/.env` |
| conda CLI 工具 | `~/miniconda3/envs/biomni_cli/bin`（`run_biomni.py` 自动加入 PATH） |
| 本地二进制 | `~/Biomni/bin`（含 plink2、GCTA） |

引擎离线时 `biomni_run` 会退回 `direct` 模式，即直接运行 `run_biomni.py "<task>"`。Gradio 在线时优先走 Gradio simple-call，支持附件与同会话历史续接。

## 3. 推荐工作流

1. `biomni_status` — 确认 Gradio、venv、数据湖是否在线/存在。
2. `biomni_tools` — 不带参数看 21 个模块摘要；带 query 检索工具，例如 `scRNA`、`pubmed`、`docking`、`flow cytometry`、`liftover`。
3. `biomni_run(task=...)` — 端到端委托给 Biomni agent。Biomni 内部会自行选择工具、生成并执行 Python/R/bash、检索数据湖、注入 know-how，并返回最终答案。优先使用它而不是手工拼接工具调用。
4. 需要单个已知函数时，解锁并调用 `biomni_python`，例如：
   ```python
   from biomni.tool.genomics import gene_set_enrichment_analysis
   print(gene_set_enrichment_analysis(["Mertk","Gas6","Tbxa2r"], data_lake_path="/Users/ch8rry_spe/Biomni/data/biomni_data"))
   ```
   具体函数签名以 `inspect.signature()` 或源码为准；函数内部的 LLM 调用需要 `~/Biomni/.env`。
5. 需要特定数据时 `biomni_data`；需要已验证领域工作流时 `biomni_know_how`。
6. 结果文件通常由 Biomni 写到任务运行时的 cwd（Gradio 模式可能是 Gradio 缓存目录，direct 模式是 `~/Biomni`）；在 executor 输出中查找 `/private/...`、`*.png`、`*.pdf`、`*.csv` 等路径并用 `bash` 查看或复制到工作区。

## 4. 工具目录（21 modules / 218 tools，以 `biomni_tools` 实时结果为准）

- `literature` — PubMed / arXiv / Google Scholar / DOI supplementary / URL / PDF 提取 / 深度 web search
- `database` — UniProt、PDB、KEGG、GEO、ClinVar、Ensembl、UCSC、OpenTargets、OpenFDA、ChemBL、PubChem、Reactome、GWAS Catalog 等模式化查询
- `genomics` — scRNA-seq 注释（LLM / Azimuth）、scVI/Harmony/UCE、ARCHS4、GSEA、scATAC
- `genetics` — liftover、贝叶斯 fine-mapping、CRISPR 结果分析、系统发育、群体史模拟、基因组预测
- `molecular_biology` — 序列比对、PCR/酶切/Golden Gate、引物与 sgRNA 设计、质粒注释、ORF
- `cell_biology` — 细胞周期/运动/形态/线粒体、FACS、流式
- `biochemistry` — CD、ITC、酶动力学、蛋白酶动力学、蛋白保守性
- `biophysics` — IDR 预测、细胞骨架形态、组织形变
- `bioimaging` — nnUNet 分割、SimpleITK 刚体/仿射/B-spline 配准、相似度
- `cancer_biology` — DDR 网络、突变/SV、NMF、CNV purity/ploidy
- `immunology` — 免疫细胞分选、流式增殖、细胞因子、组织学/IHC
- `microbiology` — 生长曲线、菌落计数、生物被膜、微生物图像分割
- `pharmacology` — ADMET、结合亲和力、DiffDock/AutoDock Vina、药物重定位
- `pathology` — 主动脉、血栓、角膜神经、多重成像、microCT
- `physiology` — ATP 发光、细胞内钙成像等
- `bioengineering` — 细胞迁移、药物释放、肌纤维形态、全细胞 ODE
- `synthetic_biology`、`systems_biology`、`glycoengineering`、`lab_automation`、`support_tools` 等以实时目录为准。

模块导入名是 `biomni.tool.<short>`（例如 `biomni.tool.genomics`）。工具名与描述以 `biomni_tools` 返回为准，不要凭本 skill 的记忆猜测签名。

## 5. Biomni agent 的输入输出语义

- `generate_response(prompt_input, inner_history, main_history)` 返回 `(inner, main)`。
- `inner` 是执行器 pane：推理、代码、观察、生成文件；`main` 是主对话 pane。
- `biomni_run` 返回的是最终 snapshot 的截断报告；完整文件落在磁盘，不在聊天文本里。
- Gradio 模式默认 `continuePrevious=true`，同一 DSH 会话的 Biomni 历史会续传；`reset=true` 开始新 Biomni 会话。direct 模式是每次独立单任务，无历史。

## 6. Know-how 与数据湖

- `biomni_know_how` 读取 `~/Biomni/.venv/lib/python*/site-packages/biomni/know_how/*.md`。
- 当前内置一个文档：Thorp lab 新生 vs 成年心脏巨噬细胞 efferocytosis scRNA-seq 流程（本 preset 的 `neonatal-cardiac-regeneration` skill 是其副本）。
- Biomni A1 初始化时会把 know-how 文档注入其系统提示词，所以 `biomni_run` 执行匹配任务时已经带有这些工作流知识；DSH 侧需要审阅或按文档规划时，可 `skill_load neonatal-cardiac-regeneration`。
- 数据湖描述来自 `biomni.env_desc.data_lake_dict`，实际文件在 `~/Biomni/data/biomni_data/data_lake`。商业许可限制由 Biomni 的 `commercial_mode` 控制，本 preset 不改变该设置。

## 7. 故障排查

- `biomni_status` 显示 Gradio offline：确认 `cd ~/Biomni && .venv/bin/python run_biomni.py --gradio`；或继续用 direct 模式。
- Gradio 上传/调用报错：检查访问码/端口，重启 Gradio 进程，确认没有旧进程占用 7860。
- `biomni_tools` / `biomni_know_how` 返回 `biomni_bridge.py` 错误：确认 `~/Biomni/.venv/bin/python` 可运行且 `biomni` 包未损坏。
- 长任务超时：传更大的 `timeoutMs`；但先看 `biomni_status` 和任务复杂度，必要时拆成多个小任务。
- 需要联网时：Biomni 的 `run_biomni.py` 会尝试启用 Clash 7897 代理；若无代理则直连。DSH 的 `web_search` 是另一套工具，Biomni 内部有自己的 literature/search 工具。

## 8. 红线

- 不要声称 `biomni_tools` 返回了不存在的工具；目录以实时返回为准。
- 不要用 `bash` 直接 `pip install` 破坏 `~/Biomni/.venv`；实验性依赖优先在任务临时目录或 conda env 中处理。
- 涉及统计推断时遵守数据/批次/重复原则；已有 `cross-geo-cardiac-scrna-analysis` 与 `neonatal-cardiac-regeneration` skill 时先加载它们。
- `biomni_python` 与 shell 同权：不要执行用户未授权的破坏性操作。
