#!/usr/bin/env python3
"""JSON introspection bridge for the Biomni DSH agent preset.

The Node plugin (`biomni-agent-tools.mjs`) runs this file with the local
Biomni venv interpreter. It intentionally prints ONE JSON object to stdout and
nothing else.

Commands:
  status              install/tool/data/know-how facts
  tools               the complete live tool catalog from read_module2api()
  data                env_desc data-lake descriptions + local data_lake files
  knowhow [name]      list know-how documents, or print one matching document
"""
import json
import os
import sys
from pathlib import Path

BIOMNI_HOME = Path(os.environ.get("BIOMNI_HOME") or Path.home() / "Biomni").expanduser()


def find_site_packages() -> Path | None:
    candidates = sorted(BIOMNI_HOME.glob(".venv/lib/python*/site-packages"))
    if not candidates:
        return None
    return candidates[-1]


def ensure_importable() -> None:
    site = find_site_packages()
    if site is None:
        return
    path = str(site)
    if path not in sys.path:
        sys.path.insert(0, path)


def package_error(error: BaseException) -> dict:
    return {"error": f"{type(error).__name__}: {error}"}


def command_status() -> dict:
    ensure_importable()
    try:
        from biomni import env_desc
        from biomni.know_how import KnowHowLoader
        from biomni.utils import read_module2api

        modules = read_module2api()
        tools = sum(len(v) for v in modules.values())
        loader = KnowHowLoader()
        data_dir = BIOMNI_HOME / "data" / "biomni_data" / "data_lake"
        files = sorted(p.name for p in data_dir.iterdir()) if data_dir.is_dir() else []
        return {
            "biomniHome": str(BIOMNI_HOME),
            "toolCount": tools,
            "moduleCount": len(modules),
            "knowHowCount": len(loader.documents),
            "dataLakeDescriptions": len(getattr(env_desc, "data_lake_dict", {})),
            "dataLakeFiles": len(files),
            "dataLakeDir": str(data_dir),
        }
    except Exception as exc:  # noqa: BLE001 - bridge must always answer JSON
        return package_error(exc)


def command_tools() -> dict:
    ensure_importable()
    try:
        from biomni.utils import read_module2api

        modules = {}
        total = 0
        for module, tools in read_module2api().items():
            short = module.rsplit(".", 1)[-1]
            entries = []
            for tool in tools:
                name = tool.get("name")
                if not name:
                    continue
                description = " ".join((tool.get("description") or "").strip().split())
                entries.append({"name": name, "description": description[:600]})
            entries.sort(key=lambda item: item["name"])
            modules[short] = {"module": module, "count": len(entries), "tools": entries}
            total += len(entries)
        return {"totalTools": total, "modules": modules}
    except Exception as exc:  # noqa: BLE001
        return package_error(exc)


def command_data() -> dict:
    ensure_importable()
    try:
        from biomni import env_desc

        entries = {}
        for key, value in getattr(env_desc, "data_lake_dict", {}).items():
            entries[str(key)] = " ".join(str(value).split())[:500]
        data_dir = BIOMNI_HOME / "data" / "biomni_data" / "data_lake"
        files = sorted(p.name for p in data_dir.iterdir()) if data_dir.is_dir() else []
        return {"count": len(entries), "entries": entries, "files": files, "dataLakeDir": str(data_dir)}
    except Exception as exc:  # noqa: BLE001
        return package_error(exc)


def command_knowhow(name: str | None = None) -> dict | list[dict]:
    ensure_importable()
    try:
        from biomni.know_how import KnowHowLoader

        loader = KnowHowLoader()
        docs = loader.get_all_documents()
        if name is None:
            return [{"name": doc.get("name") or "unnamed"} for doc in docs]
        wanted = name.strip().lower()
        for doc in docs:
            doc_name = str(doc.get("name") or "")
            content = str(doc.get("content_without_metadata") or "")
            if wanted in doc_name.lower() or wanted in content[:200].lower():
                return {"name": doc_name, "content": content}
        return {"name": None, "content": ""}
    except Exception as exc:  # noqa: BLE001
        return package_error(exc)


def main() -> None:
    args = sys.argv[1:]
    if not args:
        result: dict | list[dict] = {"error": "missing command"}
    elif args[0] == "status":
        result = command_status()
    elif args[0] == "tools":
        result = command_tools()
    elif args[0] == "data":
        result = command_data()
    elif args[0] == "knowhow":
        result = command_knowhow(args[1] if len(args) > 1 else None)
    else:
        result = {"error": f"unknown command {args[0]!r}"}
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
