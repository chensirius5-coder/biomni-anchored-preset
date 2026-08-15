#!/usr/bin/env node
/**
 * Syntax-check every preset .mjs plugin with the local Node binary.
 * The preset intentionally has no dependencies, so this is the full static
 * gate; behavioral coverage lives in test/.
 */
import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = readdirSync(root).filter((name) => name.endsWith('.mjs')).sort()
const failed = []
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.status !== 0) failed.push(file)
}
if (failed.length > 0) {
  console.error(`syntax check failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`syntax ok: ${files.join(', ')}`)
