import test from 'node:test'
import assert from 'node:assert/strict'

const mod = await import(new URL('../tool-bootstrap.mjs', import.meta.url))

function makeContext() {
  const listeners = new Map()
  return {
    listeners,
    on(event, callback) {
      listeners.set(event, callback)
    },
  }
}

const baseConfig = {
  bootstrapTools: ['bash', 'str_replace_editor'],
  promoteOn: 'either',
  suppressedContextSources: ['agent-instructions', 'skill-catalog'],
  compactionTools: ['read', 'write', 'edit', 'glob', 'grep', 'todo_write', 'ask_user_question'],
  residentTools: ['biomni_status', 'biomni_tools', 'biomni_run', 'biomni_know_how'],
}

const allTools = [
  'bash', 'str_replace_editor', 'dev_tool_search', 'skill_search', 'skill_load',
  'biomni_status', 'biomni_tools', 'biomni_run', 'biomni_know_how',
  'biomni_data', 'biomni_python', 'web_search', 'subagent', 'read', 'write',
].map((name) => ({ name }))

test('first request keeps the Minimal tool pair', async () => {
  const ctx = makeContext()
  mod.apply(ctx, baseConfig)
  const assemble = ctx.listeners.get('system-prompt/assemble')
  assert.equal(typeof assemble, 'function')
  const result = await assemble({}, { agent: { session: { id: 'fresh', events: [] } } }, async () => ({ tools: allTools }))
  assert.deepEqual(result.tools.map((tool) => tool.name), ['bash', 'str_replace_editor'])
})

test('promoted request exposes discovery tools and resident Biomni core tools', async () => {
  const ctx = makeContext()
  mod.apply(ctx, baseConfig)
  const assemble = ctx.listeners.get('system-prompt/assemble')
  const agent = { session: { id: 'promoted', events: [{ type: 'tool/call', seq: 1 }] } }
  const result = await assemble({}, { agent }, async () => ({ tools: allTools }))
  assert.deepEqual(result.tools.map((tool) => tool.name), [
    'bash',
    'str_replace_editor',
    'dev_tool_search',
    'skill_search',
    'skill_load',
    'biomni_status',
    'biomni_tools',
    'biomni_run',
    'biomni_know_how',
  ])
})

test('unknown config keys fail at apply time', () => {
  const ctx = makeContext()
  assert.throws(() => mod.apply(ctx, { ...baseConfig, typoKey: true }), /unknown config key/)
})
