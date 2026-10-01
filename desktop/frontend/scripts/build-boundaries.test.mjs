import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { basename } from 'node:path'
import { loadConfigFromFile } from 'vite'

async function config(file) {
  const result = await loadConfigFromFile({ command: 'build', mode: 'production' }, fileURLToPath(new URL(`../${file}`, import.meta.url)))
  return result.config
}

test('production owns only the app entry; labs own a separate output', async () => {
  const appConfig = await config('vite.config.ts')
  const labsConfig = await config('vite.labs.config.ts')
  assert.deepEqual(Object.keys(appConfig.build.rolldownOptions.input), ['main'])
  assert.equal(labsConfig.build.outDir, 'dist-labs')
  const htmlFiles = (await readdir(new URL('../', import.meta.url))).filter(file => file.endsWith('.html')).sort()
  const entries = Object.values(labsConfig.build.rolldownOptions.input).map(path => basename(path)).sort()
  assert.deepEqual(entries, htmlFiles)
})

test('Vitest selects Vue/TS suites rather than Node runner suites', async () => {
  const unitConfig = await config('vitest.config.ts')
  assert.deepEqual(unitConfig.test.include, ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'])
  assert.equal(unitConfig.test.environment, 'jsdom')
})
