import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { VERSION, cyrb128, renderAurora } from '../src/lib/aurora/aurora.mjs'
import { encodePNG } from './png.mjs'

export function renderAuroraPNG(seed, size = 256) {
  return encodePNG(renderAurora(seed, size), size, size)
}

// Call this before constructing URLs containing email-derived identities.
export function publicEmailSeed(email) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

const sizes = new Set([32, 64, 128, 256, 512])
export function auroraHandler(req, res, next = () => { res.statusCode = 404; res.end() }) {
  const url = new URL(req.url, 'http://localhost')
  const match = /^\/avatars\/v1\/([^/]+)\.png$/.exec(url.pathname)
  if (!match) return next()
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return
  }
  let seed
  try { seed = decodeURIComponent(match[1]).trim().toLowerCase() } catch {
    res.writeHead(400); res.end('Invalid seed'); return
  }
  const sizeString = url.searchParams.get('size') ?? '256'
  const size = Number(sizeString)
  if (!sizes.has(size) || String(size) !== sizeString || url.searchParams.getAll('size').length > 1) {
    res.writeHead(400); res.end('Size must be 32, 64, 128, 256, or 512'); return
  }
  if (!seed || seed.length > 512 || seed.includes('@')) {
    res.writeHead(400); res.end('Use a public seed of 1–512 characters; hash emails before constructing URLs'); return
  }
  const hash = cyrb128(seed).map(word => word.toString(16).padStart(8, '0')).join('')
  const etag = `"aurora-v${VERSION}-${size}-${hash}"`
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.setHeader('ETag', etag)
  if ((req.headers['if-none-match'] ?? '').split(',').some(value => value.trim().replace(/^W\//, '') === etag || value.trim() === '*')) {
    res.writeHead(304); res.end(); return
  }
  if (req.method === 'HEAD') { res.end(); return }
  res.end(renderAuroraPNG(seed, size))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8787)
  createServer(auroraHandler).listen(port, '127.0.0.1', () => {
    console.log(`Aurora v${VERSION}: http://127.0.0.1:${port}/avatars/v${VERSION}/ada.lovelace.png?size=256`)
  })
}
