// PNG with uncompressed DEFLATE blocks: synchronous, portable, and canvas-free.
// The Node endpoint uses the supplied compressed encoder for network responses.
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(Array.from(type, c => c.charCodeAt(0)), 4)
  out.set(data, 8)
  let crc = ~0
  for (const byte of out.subarray(4, -4)) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8)
  view.setUint32(out.length - 4, (~crc) >>> 0)
  return out
}
export function browserPng(rgba: Uint8ClampedArray, size: number): Uint8Array {
  const stride = size * 4 + 1
  const raw = new Uint8Array(stride * size)
  for (let y = 0; y < size; y++) raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * stride + 1)
  const blocks = Math.ceil(raw.length / 65535)
  const zlib = new Uint8Array(2 + blocks * 5 + raw.length + 4)
  zlib.set([0x78, 0x01])
  let cursor = 2
  for (let offset = 0; offset < raw.length; offset += 65535) {
    const length = Math.min(65535, raw.length - offset)
    zlib.set([offset + length === raw.length ? 1 : 0, length & 255, length >>> 8, (~length) & 255, ((~length) >>> 8) & 255], cursor)
    zlib.set(raw.subarray(offset, offset + length), cursor + 5)
    cursor += length + 5
  }
  let a = 1, b = 0
  for (const byte of raw) { a = (a + byte) % 65521; b = (b + a) % 65521 }
  new DataView(zlib.buffer).setUint32(cursor, ((b << 16) | a) >>> 0)
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, size); view.setUint32(4, size)
  header[8] = 8; header[9] = 6
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib), chunk('IEND', new Uint8Array())]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.length }
  return out
}
