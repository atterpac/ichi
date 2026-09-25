import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { VERSION, cyrb128, rngFor, palette, auroraParams, renderAurora } from '../src/lib/aurora/aurora.mjs'
import { renderAuroraPNG, auroraHandler, publicEmailSeed } from './aurora.mjs'

const hash = pixels => createHash('sha256').update(pixels).digest('hex').slice(0, 16)
const goldens = [
  ['ada.lovelace', '0b730ab9 548809cc 71b4f483 88942a1e', .8408728812, [104,218,156], [53,21,27], '8b099500118f43aa', [[67,52,43],[163,255,229],[27,11,14]]],
  ['grace', 'b2db6920 05d0a8fa 84c06e91 bfff0556', .8065076759, [106,213,243], [60,44,25], '6dad18a60a0968a0', [[62,45,26],[255,255,255],[30,22,13]]],
  ['user_42', '089c0986 7b183af3 a59575d7 13da695a', .6223510916, [114,217,213], [59,34,23], 'd761759244e8214f', [[62,42,28],[135,196,184],[30,17,12]]],
]
for (const [seed, words, first, color, dark, digest, spots] of goldens) {
  test(`v1 goldens: ${seed}`, () => {
    assert.equal(VERSION, 1)
    assert.equal(cyrb128(seed).map(x => x.toString(16).padStart(8, '0')).join(' '), words)
    assert.equal(Number(rngFor(seed + ':aurora')().toFixed(10)), first)
    assert.deepEqual(palette(seed).colors[0], color)
    assert.deepEqual(palette(seed).dark, dark)
    const pixels = renderAurora(seed, 128)
    assert.equal(hash(pixels), digest)
    for (const [i, row] of [0, 64, 127].entries()) {
      const offset = (row * 128 + 64) * 4
      assert.deepEqual(Array.from(pixels.slice(offset, offset + 3)), spots[i])
    }
    assert.deepEqual(renderAurora(seed, 128), pixels)
    const script = `import {renderAurora} from ${JSON.stringify(new URL('../src/lib/aurora/aurora.mjs', import.meta.url).href)}; process.stdout.write(renderAurora(${JSON.stringify(seed)},128));`
    assert.deepEqual(execFileSync(process.execPath, ['--input-type=module', '-e', script]), Buffer.from(pixels))
  })
}
test('ribbon draw order', () => {
  const ribbon = auroraParams('ada.lovelace')[0]
  for (const [key, value] of Object.entries({ y: .653167, a: .06259, f: 7.30297, ph: 5.16275, a2: .048581, f2: 17.971286, w: .062782 })) {
    assert.ok(Math.abs(ribbon[key] - value) <= .000005, key)
  }
})
test('1000 seeded random identities have distinct pixel hashes', () => {
  const random = rngFor('aurora acceptance identities')
  const hashes = new Set()
  for (let i = 0; i < 1000; i++) hashes.add(hash(renderAurora(String(random()), 32)))
  assert.equal(hashes.size, 1000)
})
test('unicode and empty seeds are deterministic; geometry scales exactly', () => {
  for (const seed of ['', 'Zoë 🌌', 'e\u0301', '\ud800']) {
    assert.deepEqual(renderAurora(seed, 32), renderAurora(seed, 32))
    const small = renderAurora(seed, 32), large = renderAurora(seed, 64)
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const a = (y * 32 + x) * 4, b = (y * 2 * 64 + x * 2) * 4
      assert.deepEqual(small.slice(a, a + 4), large.slice(b, b + 4))
    }
  }
  for (const size of [0, -1, 513, 1.5, NaN, Infinity]) assert.throws(() => renderAurora('a', size), RangeError)
})
test('PNG contains the exact RGBA pixels', () => {
  const png = renderAuroraPNG('ada.lovelace', 128)
  assert.deepEqual([...png.subarray(0, 8)], [137,80,78,71,13,10,26,10])
  const chunks = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(chunks)), pixels = renderAurora('ada.lovelace', 128)
  for (let y = 0; y < 128; y++) {
    assert.equal(raw[y * 513], 0)
    assert.deepEqual(raw.subarray(y * 513 + 1, (y + 1) * 513), Buffer.from(pixels.subarray(y * 512, (y + 1) * 512)))
  }
})
function request(url, method = 'GET', headers = {}) {
  const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value }, writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers) }, end(body) { this.body = body } }
  auroraHandler({ url, method, headers }, response)
  return response
}
test('HTTP route returns PNG, versioned immutable caching, normalized seeds, and conditional responses', () => {
  const response = request('/avatars/v1/ADA.LOVELACE.png?size=128')
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['Content-Type'], 'image/png')
  assert.equal(response.headers['Cache-Control'], 'public, max-age=31536000, immutable')
  assert.equal(response.headers.ETag, '"aurora-v1-128-0b730ab9548809cc71b4f48388942a1e"')
  assert.deepEqual(response.body, renderAuroraPNG('ada.lovelace', 128))
  assert.equal(request('/avatars/v1/ada.lovelace.png?size=128', 'GET', { 'if-none-match': response.headers.ETag }).statusCode, 304)
  assert.equal(request('/avatars/v1/grace.png', 'HEAD').body, undefined)
  for (const size of [32,64,128,256,512]) assert.equal(request(`/avatars/v1/grace.png?size=${size}`, 'HEAD').statusCode, 200)
  for (const size of ['0', '33', '1024', '-1', '1.5', '', 'NaN', '032', '32&size=64']) assert.equal(request(`/avatars/v1/grace.png?size=${size}`).statusCode, 400)
  assert.equal(request('/avatars/v1/%FF.png').statusCode, 400)
  assert.equal(request('/avatars/v1/a%40b.com.png').statusCode, 400)
  assert.equal(request('/avatars/v1/grace.png', 'POST').statusCode, 405)
  assert.equal(request('/avatars/v2/grace.png').statusCode, 404)
  assert.equal(publicEmailSeed(' Ada@Example.com '), publicEmailSeed('ada@example.com'))
})
test('256px PNG performance', t => {
  renderAuroraPNG('warmup', 256)
  const times = []
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    renderAuroraPNG(`benchmark-${i}`, 256)
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  t.diagnostic(`256px PNG median: ${times[2].toFixed(2)} ms (target <50ms)`)
  assert.ok(times[2] < 50, `median ${times[2]}ms exceeds target`)
})
