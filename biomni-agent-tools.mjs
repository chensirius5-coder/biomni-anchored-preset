/**
 * biomni-agent-tools — first-class bridge from this DSH agent preset to the
 * locally deployed Biomni stack (`~/Biomni`).
 *
 * Nothing biomedical is reimplemented here. The tools expose the existing
 * local engine surfaces:
 *
 *  - `biomni_status`   — Gradio 7860 reachability + local Biomni install facts
 *  - `biomni_tools`    — search the live catalog of all 218 Biomni tool
 *                        functions (21 modules) read from the installed package
 *  - `biomni_run`      — run one Biomni task through the Gradio simple-call
 *                        protocol when online, with direct `run_biomni.py`
 *                        fallback; attachments and per-session continuation
 *                        history are supported
 *  - `biomni_know_how` — list / read the know-how documents injected by the
 *                        local Biomni A1 agent
 *  - `biomni_data`     — search Biomni's data-lake descriptions and local
 *                        data_lake files (unlockable)
 *  - `biomni_python`   — execute arbitrary Python in the Biomni venv, i.e.
 *                        direct access to every imported `biomni.tool.*`
 *                        function (unlockable)
 *
 * The four core tools are resident after the anchored bootstrap promotes;
 * `biomni_data` and `biomni_python` stay behind dev_tool_search so the
 * promoted request stays small.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'biomni-agent-tools'

/** The tools and subprocess services must exist before these tools register. */
export const inject = ['tools', 'subprocess']

const BRIDGE_HELPER = fileURLToPath(new URL('./biomni_bridge.py', import.meta.url))
const DEFAULT_GRADIO_BASE = 'http://127.0.0.1:7860'
const DEFAULT_GRADIO_API_PATH = '/gradio_api'
const DEFAULT_TIMEOUT_MS = 900000
const DEFAULT_MAX_OUTPUT_CHARS = 60000
const DEFAULT_PY_OUTPUT_BYTES = 256000
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_CATALOG_RESULTS = 40

/** Minimal JSON schema compiler for tool parameters (zero dependencies). */
function toJsonSchema(spec) {
  const properties = {}
  const required = []
  for (const [key, meta] of Object.entries(spec || {})) {
    const prop = { type: meta.type }
    if (meta.description) prop.description = meta.description
    if (meta.items) prop.items = meta.items
    properties[key] = prop
    if (meta.required) required.push(key)
  }
  return { type: 'object', properties, required, additionalProperties: false }
}

/** Resolve plugin config against local defaults. */
function resolveConfig(config) {
  const home = homedir()
  const biomniHome = config?.biomniHome ?? process.env.BIOMNI_HOME ?? resolve(home, 'Biomni')
  const venvPython = resolve(biomniHome, '.venv/bin/python')
  const runScript = resolve(biomniHome, 'run_biomni.py')
  const dataLakeDir = resolve(biomniHome, 'data/biomni_data/data_lake')
  const sitePackages = resolve(biomniHome, '.venv/lib/python3.11/site-packages')
  return {
    biomniHome,
    venvPython,
    runScript,
    dataLakeDir,
    sitePackages,
    gradioBaseUrl: config?.gradioBaseUrl ?? process.env.BIOMNI_GRADIO_URL ?? DEFAULT_GRADIO_BASE,
    gradioApiPath: config?.gradioApiPath ?? DEFAULT_GRADIO_API_PATH,
    defaultTimeoutMs: Number.isSafeInteger(config?.defaultTimeoutMs) && config.defaultTimeoutMs > 0
      ? config.defaultTimeoutMs
      : DEFAULT_TIMEOUT_MS,
    maxOutputChars: Number.isSafeInteger(config?.maxOutputChars) && config.maxOutputChars > 0
      ? config.maxOutputChars
      : DEFAULT_MAX_OUTPUT_CHARS,
  }
}

/** Fetch with a caller-owned timeout, composable with an execution signal. */
async function fetchWithTimeout(url, init, timeoutMs, signal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Probe the local Biomni Gradio service. */
async function probeGradio(cfg, signal) {
  try {
    const res = await fetchWithTimeout(
      `${cfg.gradioBaseUrl}${cfg.gradioApiPath}/info`,
      { method: 'GET' },
      8000,
      signal,
    )
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` }
    const doc = await res.json()
    return { online: true, version: doc?.version, mode: doc?.mode }
  } catch (error) {
    return { online: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Read a response body bounded for error reporting. */
async function safeText(res) {
  try {
    return (await res.text()).slice(0, 400)
  } catch {
    return '(unreadable body)'
  }
}

/** Upload one attachment and return the Gradio FileData path. */
async function uploadGradioFile(cfg, path, name, timeoutMs, signal) {
  const bytes = await readFile(path)
  if (bytes.length > MAX_FILE_BYTES) {
    throw new Error(`attachment ${name} exceeds ${MAX_FILE_BYTES} bytes`)
  }
  const form = new FormData()
  form.append('files', new Blob([new Uint8Array(bytes)]), name)
  const res = await fetchWithTimeout(`${cfg.gradioBaseUrl}${cfg.gradioApiPath}/upload`, {
    method: 'POST',
    body: form,
  }, timeoutMs, signal)
  if (!res.ok) throw new Error(`Gradio upload failed: HTTP ${res.status} ${await safeText(res)}`)
  const paths = await res.json()
  if (!Array.isArray(paths) || typeof paths[0] !== 'string') {
    throw new Error(`Gradio upload returned an unexpected payload: ${JSON.stringify(paths).slice(0, 200)}`)
  }
  return paths[0]
}

/** Start a Gradio simple-call for `generate_response`. */
async function startGradioCall(cfg, prompt, innerHistory, mainHistory, timeoutMs, signal) {
  const res = await fetchWithTimeout(`${cfg.gradioBaseUrl}${cfg.gradioApiPath}/call/generate_response`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: [prompt, innerHistory, mainHistory] }),
  }, timeoutMs, signal)
  if (!res.ok) throw new Error(`Gradio call start failed: HTTP ${res.status} ${await safeText(res)}`)
  const doc = await res.json()
  if (typeof doc?.event_id !== 'string') {
    throw new Error(`Gradio call start returned no event_id: ${JSON.stringify(doc).slice(0, 200)}`)
  }
  return doc.event_id
}

/** Consume the Gradio SSE stream, returning the final snapshot tuple. */
async function streamGradioCall(cfg, eventId, timeoutMs, signal) {
  const res = await fetchWithTimeout(`${cfg.gradioBaseUrl}${cfg.gradioApiPath}/call/generate_response/${eventId}`, {
    method: 'GET',
  }, timeoutMs, signal)
  if (!res.ok) throw new Error(`Gradio stream open failed: HTTP ${res.status} ${await safeText(res)}`)
  if (res.body === null) throw new Error('Gradio stream open failed: empty body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = 'generating'
  let dataLines = []
  let final = null

  const flush = () => {
    if (dataLines.length === 0) return
    const payload = dataLines.join('\n')
    dataLines = []
    const kind = currentEvent || 'generating'
    currentEvent = ''
    let parsed = null
    try {
      parsed = payload === 'null' ? null : JSON.parse(payload)
    } catch {
      parsed = payload
    }
    if (kind === 'error') {
      throw new Error(typeof parsed === 'string' ? parsed : 'Biomni reported an execution error')
    }
    if (kind === 'generating' || kind === 'complete') {
      if (Array.isArray(parsed) && Array.isArray(parsed[0]) && Array.isArray(parsed[1])) final = parsed
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, '')
      buffer = buffer.slice(idx + 1)
      if (line === '') flush()
      else if (line.startsWith('event:')) currentEvent = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
  }
  flush()
  return final
}

/** Extract plain text from one Gradio chat message. */
function messageText(message) {
  if (message === null || typeof message !== 'object') return ''
  if (typeof message.content === 'string') return message.content
  if (message.content?.file?.path) return `[file] ${message.content.file.path}`
  return JSON.stringify(message.content)
}

/** Bounded text: keep head and tail when a snapshot is too large. */
function capText(text, max) {
  if (text.length <= max) return text
  const head = Math.floor(max * 0.72)
  const tail = max - head
  return `${text.slice(0, head)}\n…[truncated ${text.length - max} chars]…\n${text.slice(-tail)}`
}

/** Format the final Gradio snapshot into a model-readable report. */
function formatSnapshot(snapshot, maxChars) {
  if (snapshot === null || !Array.isArray(snapshot)) return 'Biomni returned no final snapshot.'
  const [inner, main] = snapshot
  const innerTail = Array.isArray(inner) ? inner.slice(-14) : []
  const mainTail = Array.isArray(main) ? main.slice(-4) : []
  const sections = []
  sections.push('===== Biomni result =====')
  sections.push('')
  sections.push('--- Executor pane (last steps) ---')
  for (const message of innerTail) {
    const text = capText(messageText(message).trim(), 6000)
    if (text) sections.push(`[${message.role ?? 'assistant'}] ${text}`)
  }
  sections.push('')
  sections.push('--- Main pane (last messages) ---')
  for (const message of mainTail) {
    const text = capText(messageText(message).trim(), 10000)
    if (text) sections.push(`[${message.role ?? 'assistant'}] ${text}`)
  }
  return capText(sections.join('\n'), maxChars)
}

/** Run one Python invocation and return collected output text. */
async function runProcess(ctx, cfg, args, opts = {}) {
  const timeoutMs = Number.isSafeInteger(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : cfg.defaultTimeoutMs
  const maxBytes = Number.isSafeInteger(opts.maxBytes) && opts.maxBytes > 0 ? opts.maxBytes : DEFAULT_PY_OUTPUT_BYTES
  const executable = await ctx.subprocess.resolveExecutable(cfg.venvPython, opts.env, opts.signal)
  const handle = ctx.subprocess.spawn({
    argv: [executable, ...args],
    cwd: opts.cwd ?? cfg.biomniHome,
    env: {
      PYTHONUNBUFFERED: '1',
      BIOMNI_HOME: cfg.biomniHome,
      ...(opts.env ?? {}),
    },
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes },
      stderr: { maxBytes },
    },
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    graceMs: 3000,
  })
  let outcome
  try {
    outcome = await handle.done
  } catch (error) {
    throw new Error(`python spawn failed: ${String(error)}`)
  }
  let stdout = ''
  let stderr = ''
  try {
    stdout = handle.collected.stdout.readFrom(0).text
    stderr = handle.collected.stderr.readFrom(0).text
  } catch {
    // Collected readers may be unavailable on some backends; tolerate.
  }
  if (outcome.exitCode !== 0) {
    throw new Error([stdout, stderr].filter(Boolean).join('\n') || `exit code ${outcome.exitCode}`)
  }
  return { stdout, stderr, text: [stdout, stderr].filter(Boolean).join('\n') }
}

/** Run the bundled Python introspection bridge and parse its JSON output. */
async function runBridge(ctx, cfg, args, opts = {}) {
  const result = await runProcess(ctx, cfg, [BRIDGE_HELPER, ...args], {
    ...opts,
    env: { PYTHONPATH: cfg.sitePackages, ...(opts.env ?? {}) },
  })
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`biomni_bridge.py returned invalid JSON: ${result.stdout.slice(0, 400)}`)
  }
}

/** Normalize a query into lowercase tokens. */
function tokens(text) {
  return (text || '').toLowerCase().split(/[^a-z0-9_.:-]+/).filter(Boolean)
}

/** Register the Biomni bridge tools. */
export function apply(ctx, config) {
  const cfg = resolveConfig(config)
  const histories = new Map()

  const outputOf = (text) => ({
    schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_a, v) => [{ type: 'text', text: v.text }],
  })

  ctx.tools.register({
    name: 'biomni_status',
    description: 'Check the locally deployed Biomni engine: Gradio service reachability (http://127.0.0.1:7860), install paths, tool-catalog size, know-how documents, and data-lake directory. Call this before biomni_run when the engine may be offline.',
    parameters: toJsonSchema({}),
    output: outputOf(),
    async execute(_args, exec) {
      const gradio = await probeGradio(cfg, exec?.signal)
      const facts = {
        'Gradio engine': gradio.online
          ? `online (gradio ${gradio.version ?? '?'}, mode ${gradio.mode ?? '?'})`
          : `offline — ${gradio.error ?? 'unreachable'} (direct run fallback available)`,
        'Biomni home': `${cfg.biomniHome} (${existsSync(cfg.biomniHome) ? 'present' : 'missing'})`,
        'run_biomni.py': `${cfg.runScript} (${existsSync(cfg.runScript) ? 'present' : 'missing'})`,
        'Venv python': `${cfg.venvPython} (${existsSync(cfg.venvPython) ? 'present' : 'missing'})`,
        'Data lake dir': `${cfg.dataLakeDir} (${existsSync(cfg.dataLakeDir) ? 'present' : 'missing'})`,
      }
      let bridge
      try {
        bridge = await runBridge(ctx, cfg, ['status'], { signal: exec?.signal, timeoutMs: 60000 })
      } catch (error) {
        bridge = { error: error instanceof Error ? error.message : String(error) }
      }
      const lines = ['Biomni local engine status:', ...Object.entries(facts).map(([k, v]) => `- ${k}: ${v}`)]
      if (bridge?.toolCount !== undefined) lines.push(`- Installed Biomni tools: ${bridge.toolCount} across ${bridge.moduleCount} modules`)
      if (bridge?.knowHowCount !== undefined) lines.push(`- Know-how documents: ${bridge.knowHowCount}`)
      if (bridge?.dataLakeDescriptions !== undefined) lines.push(`- Data-lake descriptions: ${bridge.dataLakeDescriptions}`)
      if (bridge?.error) lines.push(`- Python introspection: ${bridge.error}`)
      return { text: lines.join('\n') }
    },
  })

  ctx.tools.register({
    name: 'biomni_tools',
    description: 'Search the full catalog of locally installed Biomni tool functions (218 tools across 21 biomedical modules). Pass no query for a module summary; pass a query to match tool names or descriptions; optionally pass module to list one module. This is the live catalog the Biomni engine uses.',
    parameters: toJsonSchema({
      query: { type: 'string', required: false, description: 'keywords, e.g. "scRNA", "pubmed", "docking"' },
      module: { type: 'string', required: false, description: 'exact short module name, e.g. "genomics", "database", "literature"' },
    }),
    output: outputOf(),
    async execute(args, exec) {
      const catalog = await runBridge(ctx, cfg, ['tools'], { signal: exec?.signal, timeoutMs: 120000 })
      const modules = catalog?.modules ?? {}
      const wanted = tokens(args.query)
      const moduleName = typeof args.module === 'string' ? args.module.trim() : ''
      const lines = []
      if (moduleName) {
        const mod = modules[moduleName]
        if (!mod) {
          return { text: `Unknown module "${moduleName}". Available modules: ${Object.keys(modules).sort().join(', ')}` }
        }
        lines.push(`${moduleName} (${mod.module}) — ${mod.count} tools:`)
        for (const tool of mod.tools) lines.push(`- ${tool.name}: ${tool.description}`)
        return { text: lines.join('\n') }
      }
      if (wanted.length === 0) {
        lines.push(`Installed Biomni tool catalog: ${catalog.totalTools} tools across ${Object.keys(modules).length} modules.`)
        lines.push('')
        for (const [short, mod] of Object.entries(modules).sort(([a], [b]) => a.localeCompare(b))) {
          lines.push(`- ${short}: ${mod.count} tools (${mod.module})`)
        }
        lines.push('')
        lines.push('Pass query to search, or module to list one module. Use biomni_run to let the Biomni engine select and execute tools for a task.')
        return { text: lines.join('\n') }
      }
      const matches = []
      for (const mod of Object.values(modules)) {
        for (const tool of mod.tools) {
          const hay = tokens(`${tool.name} ${tool.description} ${mod.module}`).join(' ')
          if (wanted.every((token) => hay.includes(token))) matches.push({ ...tool, module: mod.module })
        }
      }
      if (matches.length === 0) return { text: `No Biomni tools match "${args.query}". Try broader keywords, or call biomni_tools with no query for the module list.` }
      const head = matches.slice(0, MAX_CATALOG_RESULTS)
      lines.push(`Matching Biomni tools (${matches.length}${matches.length > MAX_CATALOG_RESULTS ? `, showing ${MAX_CATALOG_RESULTS}` : ''}):`)
      for (const tool of head) lines.push(`- ${tool.name} [${tool.module}]: ${tool.description}`)
      return { text: capText(lines.join('\n'), cfg.maxOutputChars) }
    },
  })

  ctx.tools.register({
    name: 'biomni_run',
    description: 'Run a biomedical task on the locally deployed Biomni agent and return the final answer plus executor trace. Uses the Gradio 7860 engine when online (streaming snapshots, attachments, and same-session continuation) and falls back to direct ~/Biomni/.venv/bin/python run_biomni.py when offline. This is the full Biomni agent: all 218 tools, code execution, data-lake retrieval, and know-how.',
    parameters: toJsonSchema({
      task: { type: 'string', required: true, description: 'full biomedical task description for Biomni' },
      mode: { type: 'string', required: false, description: 'auto (default), gradio, or direct' },
      files: {
        type: 'array',
        required: false,
        description: 'absolute local file paths to attach (Gradio mode only)',
        items: { type: 'string' },
      },
      timeoutMs: { type: 'number', required: false, description: 'override the default 900000 ms timeout' },
      continuePrevious: { type: 'boolean', required: false, description: 'pass the previous Biomni snapshot as history (default true, Gradio mode)' },
      reset: { type: 'boolean', required: false, description: 'discard the Biomni conversation history for this DSH session' },
    }),
    output: outputOf(),
    async execute(args, exec) {
      const task = typeof args.task === 'string' ? args.task.trim() : ''
      if (!task) return { text: 'biomni_run requires a non-empty task.' }
      const mode = args.mode === 'gradio' || args.mode === 'direct' ? args.mode : 'auto'
      const timeoutMs = Number.isSafeInteger(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : cfg.defaultTimeoutMs
      const sessionId = exec?.agent?.session?.id ?? 'default'
      const sessionCwd = exec?.agent?.session?.header?.cwd ?? process.cwd()
      const files = Array.isArray(args.files) ? args.files.filter((f) => typeof f === 'string' && f.length > 0) : []
      const reset = args.reset === true
      const useHistory = args.continuePrevious !== false && !reset
      const gradio = mode === 'direct'
        ? { online: false, error: 'not probed (direct mode)' }
        : await probeGradio(cfg, exec?.signal)

      if (mode === 'direct' || (mode === 'auto' && !gradio.online)) {
        if (mode === 'gradio') {
          return { text: `Biomni Gradio engine is offline: ${gradio.error ?? 'unreachable'}. Use mode=direct or start ~/Biomni Gradio first.` }
        }
        const fileNotes = files.map((path) => resolve(sessionCwd, path)).map((path) => `- ${path}`).join('\n')
        const taskText = fileNotes ? `${task}\n\nAttached local files (read them directly from disk):\n${fileNotes}` : task
        const started = Date.now()
        const result = await runProcess(ctx, cfg, [cfg.runScript, taskText], {
          signal: exec?.signal,
          timeoutMs,
          maxBytes: 512000,
        })
        const lines = [
          `Biomni direct run completed in ${Math.round((Date.now() - started) / 1000)}s.`,
          '',
          capText(result.text || '(no output)', cfg.maxOutputChars),
        ]
        return { text: lines.join('\n') }
      }

      // Gradio path (auto with engine online, or explicit gradio).
      const gradioFiles = []
      for (const path of files) {
        const absolute = resolve(sessionCwd, path)
        gradioFiles.push({ path: await uploadGradioFile(cfg, absolute, basename(absolute), timeoutMs, exec?.signal), orig_name: basename(absolute) })
      }
      const prompt = {
        text: task,
        files: gradioFiles.map((f) => ({ path: f.path, orig_name: f.orig_name, meta: { _type: 'gradio.FileData' } })),
      }
      const previous = useHistory ? (histories.get(sessionId) ?? { inner: [], main: [] }) : { inner: [], main: [] }
      const eventId = await startGradioCall(cfg, prompt, previous.inner, previous.main, timeoutMs, exec?.signal)
      const started = Date.now()
      const snapshot = await streamGradioCall(cfg, eventId, timeoutMs, exec?.signal)
      if (snapshot !== null && Array.isArray(snapshot[0]) && Array.isArray(snapshot[1])) histories.set(sessionId, { inner: snapshot[0], main: snapshot[1] })
      const header = `Biomni Gradio run completed in ${Math.round((Date.now() - started) / 1000)}s (session history ${useHistory ? 'kept' : 'not kept'}).`
      return { text: `${header}\n\n${formatSnapshot(snapshot, cfg.maxOutputChars)}` }
    },
  })

  ctx.tools.register({
    name: 'biomni_know_how',
    description: 'List or read Biomni know-how documents (validated domain workflows injected into the local Biomni agent system prompt). Call with no name for a list; pass a name or prefix to read the full workflow. Current local content: the Thorp-lab neonatal vs adult cardiac macrophage scRNA-seq workflow.',
    parameters: toJsonSchema({
      name: { type: 'string', required: false, description: 'exact document name or unique name prefix' },
    }),
    output: outputOf(),
    async execute(args, exec) {
      const wanted = typeof args.name === 'string' ? args.name.trim() : ''
      if (!wanted) {
        const docs = await runBridge(ctx, cfg, ['knowhow'], { signal: exec?.signal, timeoutMs: 60000 })
        if (!Array.isArray(docs) || docs.length === 0) return { text: 'No Biomni know-how documents found.' }
        return { text: `Biomni know-how documents (${docs.length}):\n${docs.map((d) => `- ${d.name}`).join('\n')}\n\nCall biomni_know_how with a name or prefix to read one.` }
      }
      const doc = await runBridge(ctx, cfg, ['knowhow', wanted], { signal: exec?.signal, timeoutMs: 60000 })
      if (!doc?.name) return { text: `No know-how document matches "${wanted}".` }
      return { text: capText(`# ${doc.name}\n\n${doc.content ?? ''}`, cfg.maxOutputChars) }
    },
  })

  ctx.tools.register({
    name: 'biomni_data',
    description: 'Search the local Biomni data lake: curated dataset descriptions from biomni.env_desc.data_lake_dict plus the names of files actually present under ~/Biomni/data/biomni_data/data_lake. Use this before biomni_run or biomni_python when a task needs a specific dataset.',
    parameters: toJsonSchema({
      query: { type: 'string', required: false, description: 'keywords for dataset names or descriptions, e.g. "scRNA", "GEO", "ATAC"' },
    }),
    output: outputOf(),
    async execute(args, exec) {
      const wanted = tokens(args.query)
      const data = await runBridge(ctx, cfg, ['data'], { signal: exec?.signal, timeoutMs: 60000 })
      const entries = data?.entries ?? {}
      const files = data?.files ?? []
      const lines = []
      lines.push(`Biomni data lake: ${Object.keys(entries).length} curated descriptions, ${files.length} local files under ${cfg.dataLakeDir}.`)
      if (wanted.length === 0) {
        lines.push('')
        lines.push('Curated entries:')
        for (const [name, desc] of Object.entries(entries).slice(0, 40)) lines.push(`- ${name}: ${desc}`)
        if (files.length > 0) {
          lines.push('')
          lines.push(`Local files (first ${Math.min(files.length, 40)}):`)
          for (const file of files.slice(0, 40)) lines.push(`- ${file}`)
        }
        lines.push('')
        lines.push('Pass query to search. The full engine sees these entries automatically during biomni_run.')
        return { text: capText(lines.join('\n'), cfg.maxOutputChars) }
      }
      const matches = []
      for (const [name, desc] of Object.entries(entries)) {
        const hay = tokens(`${name} ${desc}`).join(' ')
        if (wanted.every((token) => hay.includes(token))) matches.push(`- ${name}: ${desc}`)
      }
      const fileMatches = files.filter((file) => wanted.every((token) => file.toLowerCase().includes(token))).map((file) => `- [local file] ${file}`)
      if (matches.length === 0 && fileMatches.length === 0) return { text: `No data-lake entries match "${args.query}".` }
      return { text: capText([
        `Matching Biomni data-lake entries (${matches.length + fileMatches.length}):`,
        ...matches.slice(0, MAX_CATALOG_RESULTS),
        ...fileMatches.slice(0, MAX_CATALOG_RESULTS),
      ].join('\n'), cfg.maxOutputChars) }
    },
  })

  ctx.tools.register({
    name: 'biomni_python',
    description: 'Run a Python snippet inside the local Biomni venv (~/Biomni/.venv/bin/python) with PYTHONPATH pointed at the installed biomni package. This gives direct access to every Biomni tool function (e.g. from biomni.tool.genomics import gene_set_enrichment_analysis) and to Biomni\'s data-lake path helpers. Prefer biomni_run for end-to-end agent tasks; use this for one explicit function call.',
    parameters: toJsonSchema({
      code: { type: 'string', required: true, description: 'Python source to execute with the Biomni venv interpreter' },
      cwd: { type: 'string', required: false, description: 'working directory; defaults to ~/Biomni' },
      timeoutMs: { type: 'number', required: false, description: 'override the default 900000 ms timeout' },
    }),
    output: outputOf(),
    async execute(args, exec) {
      const code = typeof args.code === 'string' ? args.code : ''
      if (!code.trim()) return { text: 'biomni_python requires Python code.' }
      const timeoutMs = Number.isSafeInteger(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : cfg.defaultTimeoutMs
      const cwd = typeof args.cwd === 'string' && args.cwd.length > 0 ? resolve(args.cwd) : cfg.biomniHome
      const result = await runProcess(ctx, cfg, ['-c', code], {
        cwd,
        signal: exec?.signal,
        timeoutMs,
        maxBytes: 256000,
        env: { PYTHONPATH: cfg.sitePackages },
      })
      return { text: result.text || '(no output)' }
    },
  })
}
