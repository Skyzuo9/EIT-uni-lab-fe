import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const builderConfig = readFileSync(
  join(desktopDirectory, 'electron-builder.yml'),
  'utf8'
)
const installerInclude = readFileSync(
  join(desktopDirectory, 'build', 'installer.nsh'),
  'utf8'
)

assert.match(builderConfig, /nsis:[\s\S]*?oneClick: false/)
assert.match(builderConfig, /nsis:[\s\S]*?perMachine: false/)
assert.match(builderConfig, /nsis:[\s\S]*?include: build\/installer\.nsh/)
assert.match(builderConfig, /nsis:[\s\S]*?allowToChangeInstallationDirectory: true/)
assert.match(installerInclude, /!macro customWelcomePage/)
assert.match(installerInclude, /!insertmacro MUI_PAGE_WELCOME/)
assert.doesNotMatch(installerInclude, /isForce(?:Current|Machine)Install/)

console.log('Windows 安装器检查通过：上一步回退页已保留，安装选项未收窄')
