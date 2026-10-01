import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

const run = promisify(execFile)
const frontend = new URL('../', import.meta.url)

test('pinned inputs reproduce committed themes without a sibling checkout', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'ichi-themes-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dir = join(root, 'frontend')
  await mkdir(join(dir, 'scripts'), { recursive: true })
  await mkdir(join(dir, 'src/theme'), { recursive: true })
  await cp(new URL('scripts/generate-themes.mjs', frontend), join(dir, 'scripts/generate-themes.mjs'))
  await cp(new URL('src/theme/defs', frontend), join(dir, 'src/theme/defs'), { recursive: true })
  const goMod = await readFile(new URL('../go.mod', frontend), 'utf8')
  const version = goMod.match(/github\.com\/atterpac\/dado (v\S+)/)[1]
  const goVersion = goMod.match(/^go (\S+)/m)[1]
  const fixtureModule = `module theme-fixture\n\ngo ${goVersion}\n\nrequire github.com/atterpac/dado ${version}\n`
  await writeFile(join(root, 'go.mod'), fixtureModule)
  await cp(new URL('../go.sum', frontend), join(root, 'go.sum'))
  const env = { ...process.env }
  delete env.DADO_DIR
  const generate = (args = [], override = {}) => run(process.execPath, [join(dir, 'scripts/generate-themes.mjs'), ...args], {
    cwd: root, env: { ...env, ...override },
  })
  const output = file => readFile(join(dir, 'src/theme', file), 'utf8')

  await generate()
  for (const file of ['themes.css', 'themes.ts']) {
    assert.equal(await output(file), await readFile(new URL(`src/theme/${file}`, frontend), 'utf8'))
  }
  await generate(['--check'])
  const original = await output('themes.css')
  await generate()
  assert.equal(await output('themes.css'), original)

  // Check mode reports drift and leaves both generated files untouched.
  const types = await output('themes.ts')
  await writeFile(join(dir, 'src/theme/themes.css'), 'outdated\n')
  await assert.rejects(generate(['--check']), /themes.css is out of date/)
  assert.equal(await output('themes.css'), 'outdated\n')
  assert.equal(await output('themes.ts'), types)

  // Invalid CLI/input paths must fail before replacing either output.
  await assert.rejects(generate(['--unknown']), /Usage:/)
  await assert.rejects(generate([], { DADO_DIR: join(root, 'missing') }), /ENOENT/)
  assert.equal(await output('themes.css'), 'outdated\n')
  assert.equal(await output('themes.ts'), types)

  // Explicit overrides work, while local Ichi definitions still win collisions.
  const override = join(root, 'override/theme/themes/defs')
  await mkdir(override, { recursive: true })
  const light = await readFile(new URL('src/theme/defs/ichi-light.yaml', frontend), 'utf8')
  await writeFile(join(override, 'ichi.yaml'), light.replace('name: ichi-light', 'name: ichi'))
  await generate([], { DADO_DIR: join(root, 'override') })
  const css = await output('themes.css')
  assert.equal(css.split('\n\n')[1], original.split('\n\n')[1])
  assert.match(await output('themes.ts'), /id: 'ichi', label: 'Ichi', light: false/)

  // A local Go replacement requires an explicit override rather than silently
  // becoming the input to committed palettes.
  await writeFile(join(root, 'go.mod'), `${fixtureModule}\nreplace github.com/atterpac/dado => ./override\n`)
  await writeFile(join(root, 'override/go.mod'), 'module github.com/atterpac/dado\n')
  await assert.rejects(generate(), /versioned dado module/)
  assert.equal(await output('themes.css'), css)
})
