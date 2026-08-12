import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { prepareRuntimePayload } from './runtime-payload.mjs'

/**
 * 为安装包校验测试创建平台匹配的最小 Runtime 与默认设备包资源树。
 *
 * @param {string} resourcesDirectory Electron 解包后的 resources 目录。
 * @param {'linux-64'|'osx-64'|'osx-arm64'|'win-64'} platform Constructor 平台。
 * @returns {void} 所需载荷与默认设备包全部写入后返回。
 */
export function createPackagedRuntimeResources(
  resourcesDirectory,
  platform
) {
  mkdirSync(resourcesDirectory, { recursive: true })
  const extension = platform === 'win-64' ? '.exe' : '.sh'
  const installerPath = join(
    resourcesDirectory,
    `Uni-Lab-OS-0.11.3-${platform}${extension}`
  )
  writeFileSync(installerPath, 'constructor fixture')
  prepareRuntimePayload({
    installerPath,
    runtimeVersion: '0.11.3',
    platform,
    destinationDirectory: join(resourcesDirectory, 'runtime-installer')
  })

  const workspace = join(resourcesDirectory, 'default-workspace')
  for (const [relativePath, content] of [
    ['package.yaml', 'package:\n  name: bundled-reference\n'],
    ['deployment/local_config.py', 'config = {}\n'],
    ['deployment/graphs/device.json', '{}\n'],
    ['unilab.acceptance.json', '{}\n']
  ]) {
    const target = join(workspace, relativePath)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
}
