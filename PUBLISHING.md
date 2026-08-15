# 发布到 GitHub

本仓库已经初始化为 git 仓库（默认分支 `main`），并带 GitHub Actions CI。

## 1. 替换仓库占位信息

编辑以下文件中的 `your-org`：

- `README.md`
- `README.zh.md`
- `package.json`

例如：

```json
"repository": {
  "type": "git",
  "url": "https://github.com/你的用户名/biomni-anchored-preset.git"
}
```

## 2. 在 GitHub 创建空仓库

在 GitHub 新建一个**不初始化 README/license/.gitignore** 的空仓库，例如：

```text
https://github.com/你的用户名/biomni-anchored-preset
```

## 3. 推送

```bash
cd /Users/ch8rry_spe/Desktop/Harness/biomni-anchored-preset
git remote add origin https://github.com/你的用户名/biomni-anchored-preset.git
git push -u origin main
```

## 4. 检查 CI

GitHub 会自动运行 `.github/workflows/ci.yml`：

- `node --check` 检查全部 preset `.mjs`
- `python -m py_compile biomni_bridge.py`
- `node --test test/*.test.mjs`

## 5. 发布 Release（可选）

在 GitHub Releases 手动创建 tag：

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 6. 用户安装方式

README 已提供：

```bash
git clone https://github.com/你的用户名/biomni-anchored-preset.git
cd biomni-anchored-preset
./scripts/install.sh
```
