import { describe, it, expect } from 'vitest'
import { inflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { auroraSvg } from '../components/common/avatarAurora'
import { browserPng } from '../lib/aurora/browserPng'
import { renderAurora } from '../lib/aurora/aurora.mjs'

function decode(png: Uint8Array) {
  const bytes = Buffer.from(png)
  const data = []
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset)
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') data.push(bytes.subarray(offset + 8, offset + 8 + size))
    offset += size + 12
  }
  const width = bytes.readUInt32BE(16)
  const raw = inflateSync(Buffer.concat(data))
  const rows = []
  for (let y = 0; y < width; y++) {
    expect(raw[y * (width * 4 + 1)]).toBe(0)
    rows.push(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)))
  }
  return Buffer.concat(rows)
}
describe('Aurora browser integration', () => {
  it('embeds golden pixels into the actual avatar markup', () => {
    const svg = new DOMParser().parseFromString(auroraSvg('ada.lovelace'), 'image/svg+xml')
    const url = svg.querySelector('image')!.getAttribute('href')!
    const pixels = decode(Buffer.from(url.split(',')[1]!, 'base64'))
    expect(createHash('sha256').update(pixels).digest('hex').slice(0, 16)).toBe('8b099500118f43aa')
  })
  it('encodes exact pixels across DEFLATE block boundaries', () => {
    for (const size of [32, 128, 256]) {
      const pixels = renderAurora('grace', size)
      expect(decode(browserPng(pixels, size))).toEqual(Buffer.from(pixels))
    }
  })
})
