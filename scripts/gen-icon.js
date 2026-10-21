/**
 * assets/icon.png を生成するスクリプト（256x256 PNG）
 * electron-builder がPNGからICO自動変換してくれる
 */
'use strict'

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 256

function createPixels(size) {
  const pixels = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const cx = size / 2, cy = size / 2
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      const radius = size * 0.45
      const edge = size * 0.47

      if (dist <= edge) {
        // アンチエイリアス
        const alpha = dist > radius ? Math.max(0, 1 - (dist - radius) / (edge - radius)) : 1

        // 丸い背景: 紺色 #1a365d
        let r = 0x1a, g = 0x36, b = 0x5d

        // 文字「EP」を描画
        const nx = (x - cx) / radius
        const ny = (y - cy) / radius

        if (isLetterE(nx, ny, size) || isLetterP(nx, ny, size)) {
          r = 0xff; g = 0xff; b = 0xff
        }

        pixels[i] = r
        pixels[i + 1] = g
        pixels[i + 2] = b
        pixels[i + 3] = Math.round(alpha * 255)
      }
    }
  }
  return pixels
}

function isLetterE(nx, ny, size) {
  const lx = nx - 0.28
  const ly = ny
  const t = 0.09

  if (lx >= -0.22 && lx <= -0.22 + t && ly >= -0.32 && ly <= 0.32) return true
  if (lx >= -0.22 && lx <= 0.05 && ly >= -0.32 && ly <= -0.32 + t) return true
  if (lx >= -0.22 && lx <= -0.02 && ly >= -t/2 && ly <= t/2) return true
  if (lx >= -0.22 && lx <= 0.05 && ly >= 0.32 - t && ly <= 0.32) return true
  return false
}

function isLetterP(nx, ny, size) {
  const lx = nx + 0.12
  const ly = ny
  const t = 0.09

  if (lx >= -0.08 && lx <= -0.08 + t && ly >= -0.32 && ly <= 0.32) return true
  if (lx >= -0.08 && lx <= 0.18 && ly >= -0.32 && ly <= -0.32 + t) return true
  if (lx >= 0.18 - t && lx <= 0.18 && ly >= -0.32 && ly <= 0.02) return true
  if (lx >= -0.08 && lx <= 0.18 && ly >= 0.02 - t && ly <= 0.02) return true
  return false
}

// 最小限のPNGエンコーダー
function encodePNG(width, height, pixels) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // IDAT: filter=None(0) for each row, then deflate
  const rawData = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0 // filter: none
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const compressed = zlib.deflateSync(rawData)

  function makeChunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeB = Buffer.from(type, 'ascii')
    const crcData = Buffer.concat([typeB, data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(crcData) >>> 0, 0)
    return Buffer.concat([len, typeB, data, crc])
  }

  const iend = Buffer.alloc(0)

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', iend)
  ])
}

// CRC32
function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return crc ^ 0xffffffff
}

const pixels = createPixels(SIZE)
const png = encodePNG(SIZE, SIZE, pixels)
const outPath = path.join(__dirname, '..', 'assets', 'icon.png')
fs.writeFileSync(outPath, png)
console.log(`Created: ${outPath} (${png.length} bytes)`)
