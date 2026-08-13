import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const desktopDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDirectory = join(desktopDirectory, 'build')
const pngSignature = '89504e470d0a1a0a'

function isPng(buffer) {
  return buffer.subarray(0, 8).toString('hex') === pngSignature
}

function decodePng(buffer) {
  assert.ok(isPng(buffer), '图标条目必须使用 PNG 编码')

  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const bitDepth = buffer[24]
  const colorType = buffer[25]
  assert.equal(bitDepth, 8, '图标必须使用 8 位色深')
  assert.equal(colorType, 6, '图标必须包含 RGBA 通道')

  const idatChunks = []
  for (let offset = 8; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length))
    }
    offset += length + 12
  }

  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const raw = inflateSync(Buffer.concat(idatChunks))
  const pixels = Buffer.alloc(width * height * bytesPerPixel)

  for (let y = 0, inputOffset = 0; y < height; y += 1) {
    const filter = raw[inputOffset]
    inputOffset += 1

    for (let x = 0; x < stride; x += 1, inputOffset += 1) {
      const outputOffset = y * stride + x
      const left =
        x >= bytesPerPixel ? pixels[outputOffset - bytesPerPixel] : 0
      const above = y > 0 ? pixels[outputOffset - stride] : 0
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[outputOffset - stride - bytesPerPixel]
          : 0
      const encoded = raw[inputOffset]

      pixels[outputOffset] =
        filter === 0
          ? encoded
          : filter === 1
            ? encoded + left
            : filter === 2
              ? encoded + above
              : filter === 3
                ? encoded + Math.floor((left + above) / 2)
                : encoded + paeth(left, above, upperLeft)
    }
  }

  return { width, height, pixels }
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft
  const leftDistance = Math.abs(prediction - left)
  const aboveDistance = Math.abs(prediction - above)
  const upperLeftDistance = Math.abs(prediction - upperLeft)

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

function largestIcnsPng(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'icns')

  let largest = null
  for (let offset = 8; offset + 8 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset + 4)
    const entry = buffer.subarray(offset + 8, offset + length)
    if (
      isPng(entry) &&
      (!largest || entry.readUInt32BE(16) > largest.readUInt32BE(16))
    ) {
      largest = entry
    }
    assert.ok(length >= 8, 'ICNS 条目长度无效')
    offset += length
  }

  assert.ok(largest, 'ICNS 中必须包含 PNG 图标条目')
  return largest
}

function largestIcoPng(buffer) {
  assert.equal(buffer.readUInt16LE(0), 0, 'ICO 保留字段无效')
  assert.equal(buffer.readUInt16LE(2), 1, '文件不是 ICO 图标')

  const count = buffer.readUInt16LE(4)
  let largest = null
  let largestWidth = 0

  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16
    const width = buffer[entryOffset] || 256
    const length = buffer.readUInt32LE(entryOffset + 8)
    const imageOffset = buffer.readUInt32LE(entryOffset + 12)
    const entry = buffer.subarray(imageOffset, imageOffset + length)
    if (isPng(entry) && width > largestWidth) {
      largest = entry
      largestWidth = width
    }
  }

  assert.ok(largest, 'ICO 中必须包含 PNG 图标条目')
  return largest
}

function alphaAt(image, x, y) {
  return image.pixels[(y * image.width + x) * 4 + 3]
}

function assertRounded(image, label) {
  const cornerAlpha = [
    alphaAt(image, 0, 0),
    alphaAt(image, image.width - 1, 0),
    alphaAt(image, 0, image.height - 1),
    alphaAt(image, image.width - 1, image.height - 1)
  ]
  assert.deepEqual(cornerAlpha, [0, 0, 0, 0], `${label} 的四角必须透明`)

  const edgeCenterAlpha = [
    alphaAt(image, Math.floor(image.width / 2), 0),
    alphaAt(image, image.width - 1, Math.floor(image.height / 2)),
    alphaAt(image, Math.floor(image.width / 2), image.height - 1),
    alphaAt(image, 0, Math.floor(image.height / 2))
  ]
  assert.ok(
    edgeCenterAlpha.every((alpha) => alpha >= 250),
    `${label} 的圆角轮廓不完整`
  )
}

function alphaChannel(image) {
  const alpha = Buffer.alloc(image.width * image.height)
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = image.pixels[index * 4 + 3]
  }
  return alpha
}

const runtimeIcon = decodePng(readFileSync(join(buildDirectory, 'icon.png')))
const macIcon = decodePng(
  largestIcnsPng(readFileSync(join(buildDirectory, 'icon.icns')))
)
const windowsIcon = decodePng(
  largestIcoPng(readFileSync(join(buildDirectory, 'icon.ico')))
)

assertRounded(runtimeIcon, '运行时 PNG')
assertRounded(macIcon, 'macOS ICNS')
assertRounded(windowsIcon, 'Windows ICO')
assert.equal(runtimeIcon.width, 1024)
assert.equal(runtimeIcon.height, 1024)
assert.equal(macIcon.width, runtimeIcon.width)
assert.equal(macIcon.height, runtimeIcon.height)
assert.deepEqual(
  alphaChannel(macIcon),
  alphaChannel(runtimeIcon),
  '运行时 PNG 与 macOS ICNS 必须使用同一圆角轮廓'
)

const builderConfig = readFileSync(
  join(desktopDirectory, 'electron-builder.yml'),
  'utf8'
)
assert.match(builderConfig, /mac:[\s\S]*?icon: build\/icon\.icns/)
assert.match(builderConfig, /win:[\s\S]*?icon: build\/icon\.ico/)

console.log(
  `图标检查通过：PNG ${runtimeIcon.width}px，` +
    `ICNS ${macIcon.width}px，ICO ${windowsIcon.width}px`
)
