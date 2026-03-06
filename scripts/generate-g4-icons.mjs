import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const root = resolve(process.cwd())

const targets = [
  { path: 'AI-CrossTalk/icons/icon16.png', size: 16 },
  { path: 'AI-CrossTalk/icons/icon32.png', size: 32 },
  { path: 'AI-CrossTalk/icons/icon48.png', size: 48 },
  { path: 'AI-CrossTalk/icons/icon128.png', size: 128 },
  { path: 'web/public/icons/icon128.png', size: 128 },
]

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let index = 0; index < 8; index += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([length, typeBuffer, data, crc])
}

function rgba(red, green, blue, alpha = 255) {
  return [red, green, blue, alpha]
}

function mix(a, b, ratio) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * ratio))
}

function renderIcon(size) {
  const dark = rgba(12, 18, 42)
  const navy = rgba(37, 99, 235)
  const aqua = rgba(6, 182, 212)
  const mint = rgba(16, 185, 129)
  const white = rgba(248, 250, 252)

  const raw = Buffer.alloc((size * 4 + 1) * size)
  const center = (size - 1) / 2
  const radius = size * 0.5
  const innerRadius = size * 0.32
  const stroke = Math.max(1.25, size * 0.095)

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1)
    raw[rowOffset] = 0

    for (let x = 0; x < size; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4
      const dx = x - center
      const dy = y - center
      const dist = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx)

      let color = mix(navy, aqua, (x + y) / (size * 2))
      let alpha = 255

      if (dist > radius) {
        alpha = 0
      } else {
        const glow = Math.max(0, 1 - dist / radius)
        color = mix(dark, color, 0.35 + glow * 0.65)

        const ring = Math.abs(dist - radius * 0.72)
        if (ring < stroke * 0.95) {
          const ringMix = Math.max(0, 1 - ring / (stroke * 0.95))
          const arcColor = angle > -0.35 && angle < 1.7 ? mint : aqua
          color = mix(color, arcColor, 0.8 * ringMix)
        }

        const nodeOrbit = Math.abs(dist - radius * 0.58)
        if (nodeOrbit < stroke * 0.7) {
          const nodeAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
          for (const nodeAngle of nodeAngles) {
            const angleDelta = Math.min(Math.abs(angle - nodeAngle), Math.abs(angle - nodeAngle + 2 * Math.PI), Math.abs(angle - nodeAngle - 2 * Math.PI))
            if (angleDelta < 0.28) {
              const nodeMix = Math.max(0, 1 - angleDelta / 0.28)
              color = mix(color, white, 0.7 * nodeMix)
            }
          }
        }

        if (dist < innerRadius) {
          color = mix(white, mint, dist / innerRadius)
        }
      }

      raw[pixelOffset] = color[0]
      raw[pixelOffset + 1] = color[1]
      raw[pixelOffset + 2] = color[2]
      raw[pixelOffset + 3] = alpha
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    pngSignature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const target of targets) {
  const absolutePath = resolve(root, target.path)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, renderIcon(target.size))
}

const svg = `
<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="64" fill="url(#bg)"/>
  <circle cx="128" cy="128" r="86" stroke="url(#ring)" stroke-width="20"/>
  <path d="M82 170L174 92" stroke="#F8FAFC" stroke-width="18" stroke-linecap="round"/>
  <circle cx="128" cy="128" r="36" fill="url(#core)"/>
  <defs>
    <linearGradient id="bg" x1="28" y1="28" x2="228" y2="228" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0F172A"/>
      <stop offset="0.5" stop-color="#164E63"/>
      <stop offset="1" stop-color="#0EA5E9"/>
    </linearGradient>
    <linearGradient id="ring" x1="56" y1="64" x2="196" y2="188" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2DD4BF"/>
      <stop offset="1" stop-color="#67E8F9"/>
    </linearGradient>
    <radialGradient id="core" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(118 116) rotate(50) scale(56)">
      <stop stop-color="#F8FAFC"/>
      <stop offset="1" stop-color="#5EEAD4"/>
    </radialGradient>
  </defs>
</svg>
`.trim()

writeFileSync(resolve(root, 'web/public/icons/g4-mark.svg'), `${svg}\n`)
