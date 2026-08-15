#!/usr/bin/env python3
"""Portable Biomni launcher for the biomni-anchored-preset project.

This small launcher is intentionally provider-neutral:

- loads ``$BIOMNI_HOME/.env`` with python-dotenv
- uses the environment variables documented in ``env.example``
- never hardcodes a model vendor, proxy, API key, or machine-local path
- skips the ~11 GB data lake by default; pass ``--download-datalake`` once to
  let Biomni fetch its S3 data lake
- ``--gradio`` starts the optional Gradio service
- any other argument is treated as a one-shot task

Usage:
    python run_biomni.py "your biomedical task"
    python run_biomni.py --gradio
    python run_biomni.py --download-datalake "your task"
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env", override=False)

# Optional local command-line tools. These are never required for basic use;
# they are prepended to PATH only when the directories already exist.
for candidate in (
    Path.home() / "miniconda3" / "envs" / "biomni_cli" / "bin",
    ROOT / "bin",
):
    if candidate.is_dir():
        os.environ["PATH"] = f"{candidate}{os.pathsep}{os.environ.get('PATH', '')}"

from biomni.agent import A1  # noqa: E402
from biomni.config import default_config  # noqa: E402

DOWNLOAD_DATALAKE = "--download-datalake" in sys.argv
sys.argv = [arg for arg in sys.argv if arg != "--download-datalake"]

env = os.environ
llm = env.get("BIOMNI_LLM") or env.get("BIOMNI_LLM_MODEL") or default_config.llm
source = env.get("BIOMNI_SOURCE") or env.get("LLM_SOURCE") or None
base_url = env.get("BIOMNI_CUSTOM_BASE_URL") or env.get("CUSTOM_MODEL_BASE_URL") or default_config.base_url
api_key = env.get("BIOMNI_CUSTOM_API_KEY") or env.get("CUSTOM_MODEL_API_KEY") or default_config.api_key

if base_url and source is None:
    source = "Custom"

default_config.source = source
default_config.llm = llm
default_config.base_url = base_url
default_config.api_key = api_key
default_config.path = str(ROOT / "data")

print("=" * 60)
print(f"Biomni launcher | model: {llm} | source: {source or 'auto'}")
print(f"data: {default_config.path} | data lake: {'download' if DOWNLOAD_DATALAKE else 'skip (use --download-datalake once)'}")
print("=" * 60)

agent = A1(
    path=default_config.path,
    llm=llm,
    source=source,
    base_url=base_url,
    api_key=api_key,
    expected_data_lake_files=None if DOWNLOAD_DATALAKE else [],
)

# Keep long biomedical runs from hanging forever on providers whose default is
# an infinite request timeout.
if hasattr(agent.llm, "request_timeout"):
    try:
        agent.llm.request_timeout = int(env.get("BIOMNI_TIMEOUT_SECONDS", "900"))
    except (TypeError, ValueError):
        agent.llm.request_timeout = 900

if "--gradio" in sys.argv:
    sys.argv.remove("--gradio")
    print("starting Gradio service (optional): http://127.0.0.1:7860")
    agent.launch_gradio_demo()
    raise SystemExit(0)

if len(sys.argv) > 1:
    task = " ".join(sys.argv[1:])
    print(f"\ntask: {task}\n")
    agent.go(task)
else:
    print("\ninteractive mode: enter a task and press return, Ctrl+C exits\n")
    while True:
        try:
            task = input("\n>>> ")
        except (EOFError, KeyboardInterrupt):
            break
        if task.strip():
            agent.go(task)
