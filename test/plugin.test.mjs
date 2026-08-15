import test from 'node:test'
import assert from 'node:assert/strict'

const mod = await import(new URL('../biomni-agent-tools.mjs', import.meta.url))

function makeContext() {
  const toolMap = new Map()
  return {
    toolMap,
    tools: {
      register(definition) {
        toolMap.set(definition.name, definition)
      },
    },
    subprocess: {
      async resolveExecutable(command) {
        return command
      },
      spawn(spec) {
        const argv = spec.argv
        let stdout = '{}'
        let exitCode = 0
        const bridgeIndex = argv.findIndex((arg) => typeof arg === 'string' && arg.endsWith('biomni_bridge.py'))
        if (bridgeIndex >= 0) {
          const command = argv[bridgeIndex + 1]
          if (command === 'status') {
            stdout = JSON.stringify({
              toolCount: 218,
              moduleCount: 21,
              knowHowCount: 1,
              dataLakeDescriptions: 76,
            })
          } else if (command === 'tools') {
            stdout = JSON.stringify({
              totalTools: 2,
              modules: {
                genomics: {
                  module: 'biomni.tool.genomics',
                  count: 1,
                  tools: [{ name: 'gene_set_enrichment_analysis', description: 'Perform enrichment analysis for a list of genes.' }],
                },
              },
            })
          } else if (command === 'data') {
            stdout = JSON.stringify({
              entries: { 'demo.parquet': 'A demo dataset' },
              files: ['demo.parquet'],
            })
          } else if (command === 'knowhow') {
            stdout = JSON.stringify([{ name: 'Demo Workflow' }])
          }
        } else if (spec.cwd?.includes('fake-biomni') && argv[1]?.endsWith('run_biomni.py')) {
          stdout = 'FAKE DIRECT RUN\nargv=' + argv.slice(1).join(' ')
        } else if (argv[0]?.endsWith('/python') && argv.includes('-c')) {
          stdout = 'hello from biomni venv'
        }
        return {
          done: Promise.resolve({ exitCode }),
          collected: {
            stdout: { readFrom() { return { text: stdout } } },
            stderr: { readFrom() { return { text: '' } } },
          },
        }
      },
    },
  }
}

const config = {
  biomniHome: '/tmp/fake-biomni',
  gradioBaseUrl: 'http://127.0.0.1:7860',
  gradioApiPath: '/gradio_api',
  defaultTimeoutMs: 5000,
  maxOutputChars: 4000,
}

const fetchSnapshot = globalThis.fetch

test('registers all six Biomni tools with valid output contracts', () => {
  const ctx = makeContext()
  mod.apply(ctx, config)
  const names = [...ctx.toolMap.keys()].sort()
  assert.deepEqual(names, [
    'biomni_data',
    'biomni_know_how',
    'biomni_python',
    'biomni_run',
    'biomni_status',
    'biomni_tools',
  ])
  for (const name of names) {
    const output = ctx.toolMap.get(name).output
    assert.equal(typeof output.schema, 'object')
    assert.equal(typeof output.render, 'function')
  }
})

test('biomni_status reports local facts', async () => {
  const ctx = makeContext()
  globalThis.fetch = async () => new Response(JSON.stringify({ version: '5.0.0', mode: 'blocks' }), { status: 200 })
  try {
    mod.apply(ctx, config)
    const value = await ctx.toolMap.get('biomni_status').execute({}, {})
    assert.match(value.text, /218 across 21 modules/)
    assert.match(value.text, /76/)
  } finally {
    globalThis.fetch = fetchSnapshot
  }
})

test('biomni_tools searches the live catalog', async () => {
  const ctx = makeContext()
  mod.apply(ctx, config)
  const value = await ctx.toolMap.get('biomni_tools').execute({ query: 'enrichment' }, {})
  assert.match(value.text, /gene_set_enrichment_analysis/)
})

test('biomni_know_how and biomni_data answer from the bridge', async () => {
  const ctx = makeContext()
  mod.apply(ctx, config)
  const knowHow = await ctx.toolMap.get('biomni_know_how').execute({}, {})
  assert.match(knowHow.text, /Demo Workflow/)
  const data = await ctx.toolMap.get('biomni_data').execute({}, {})
  assert.match(data.text, /demo\.parquet/)
})

test('biomni_run direct mode skips Gradio probing and runs run_biomni.py', async () => {
  const ctx = makeContext()
  mod.apply(ctx, config)
  const value = await ctx.toolMap.get('biomni_run').execute({ task: 'hello biomni', mode: 'direct' }, {})
  assert.match(value.text, /FAKE DIRECT RUN/)
  assert.match(value.text, /hello biomni/)
})

test('biomni_python executes in the Biomni venv', async () => {
  const ctx = makeContext()
  mod.apply(ctx, config)
  const value = await ctx.toolMap.get('biomni_python').execute({ code: 'print("hello")' }, {})
  assert.match(value.text, /hello from biomni venv/)
})
