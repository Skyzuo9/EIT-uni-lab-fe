import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const ROOT = process.cwd()
const DEFAULT_BASE = 'origin/integration/fe-os-migration'
const REPORT_LINE_THRESHOLD = 500
const DEEP_MODULE_THRESHOLD = 800
const HARD_LINE_LIMIT = 1500
const DEFAULT_COMPLEXITY_LIMIT = 25
const DUPLICATE_WINDOW_SIZE = 50
const MAX_FILE_DUPLICATION = 0.35
const MAX_AGGREGATE_DUPLICATION = 0.15
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'])
const STYLE_EXTENSIONS = new Set(['.css', '.scss'])

function parseBaseArgument() {
  const index = process.argv.indexOf('--base')
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1]
  }
  return process.env.QUALITY_BASE_REF || DEFAULT_BASE
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function resolveBase(candidate) {
  try {
    git(['rev-parse', '--verify', `${candidate}^{commit}`])
    return candidate
  } catch {
    try {
      git(['rev-parse', '--verify', 'HEAD^'])
      console.warn(`[quality] 找不到基线 ${candidate}，回退到 HEAD^。`)
      return 'HEAD^'
    } catch {
      console.warn(`[quality] 找不到基线 ${candidate}，仅检查当前工作区。`)
      return null
    }
  }
}

function changedFiles(base) {
  const names = new Set()
  const collect = (args) => {
    const output = git(args)
    if (!output) return
    for (const name of output.split('\n')) names.add(name)
  }

  if (base) collect(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`, '--'])
  collect(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD', '--'])
  collect(['ls-files', '--others', '--exclude-standard', '--'])

  return [...names]
    .filter((name) => name.startsWith('apps/') || name.startsWith('packages/'))
    .filter((name) => SOURCE_EXTENSIONS.has(extname(name)) || STYLE_EXTENSIONS.has(extname(name)))
    .filter((name) => !/(?:^|\/)(?:dist|coverage|node_modules)\//.test(name))
    .filter((name) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name))
    .sort()
}

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function isFunction(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  )
}

function complexityIncrement(node) {
  if (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node)
  ) {
    return 1
  }
  if (ts.isCaseClause(node) && node.statements.length > 0) return 1
  if (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(node.operatorToken.kind)
  ) {
    return 1
  }
  return 0
}

function functionName(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text
  const parent = node.parent
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text
  return '<anonymous>'
}

function measureComplexity(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file))
  const results = []

  const visit = (node) => {
    if (isFunction(node)) {
      let complexity = 1
      const countBranches = (child) => {
        if (child !== node && isFunction(child)) return
        complexity += complexityIncrement(child)
        ts.forEachChild(child, countBranches)
      }
      ts.forEachChild(node, countBranches)
      const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      results.push({ name: functionName(node), complexity, line: start })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return results.sort((left, right) => right.complexity - left.complexity)
}

function tokenSequence(file, text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, scriptKind(file), text)
  const tokens = []
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token !== ts.SyntaxKind.WhitespaceTrivia && token !== ts.SyntaxKind.NewLineTrivia) {
      tokens.push(`${token}:${scanner.getTokenText()}`)
    }
    token = scanner.scan()
  }
  return tokens
}

function hashWindow(tokens, start) {
  return createHash('sha1')
    .update(tokens.slice(start, start + DUPLICATE_WINDOW_SIZE).join('\u0000'))
    .digest('hex')
}

function measureDuplication(sources) {
  const occurrences = new Map()
  const duplicatedIndexes = new Map()
  let totalTokens = 0

  for (const source of sources) {
    totalTokens += source.tokens.length
    duplicatedIndexes.set(source.file, new Set())
    for (let start = 0; start <= source.tokens.length - DUPLICATE_WINDOW_SIZE; start += 5) {
      const hash = hashWindow(source.tokens, start)
      const entries = occurrences.get(hash) || []
      entries.push({ file: source.file, start })
      occurrences.set(hash, entries)
    }
  }

  for (const entries of occurrences.values()) {
    if (entries.length < 2) continue
    const distinctLocations = new Set(entries.map(({ file, start }) => `${file}:${start}`))
    if (distinctLocations.size < 2) continue
    for (const { file, start } of entries) {
      const indexes = duplicatedIndexes.get(file)
      for (let offset = 0; offset < DUPLICATE_WINDOW_SIZE; offset += 1) indexes.add(start + offset)
    }
  }

  const files = sources.map(({ file, tokens }) => ({
    file,
    tokens: tokens.length,
    duplicatedTokens: duplicatedIndexes.get(file).size,
    ratio: tokens.length ? duplicatedIndexes.get(file).size / tokens.length : 0,
  }))
  const duplicatedTokens = files.reduce((sum, item) => sum + item.duplicatedTokens, 0)
  return { files, totalTokens, duplicatedTokens, ratio: totalTokens ? duplicatedTokens / totalTokens : 0 }
}

const config = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/frontend-quality-exceptions.json'), 'utf8'),
)
const base = resolveBase(parseBaseArgument())
const files = changedFiles(base)
const failures = []
const reports = []
const sources = []

for (const file of files) {
  const text = readFileSync(resolve(ROOT, file), 'utf8')
  const lines = text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length
  const exception = config.moduleExceptions[file]

  if (lines > HARD_LINE_LIMIT) {
    failures.push(`${file}: ${lines} 行，超过 ${HARD_LINE_LIMIT} 行硬限制。`)
  } else if (lines >= DEEP_MODULE_THRESHOLD) {
    if (!exception) {
      failures.push(`${file}: ${lines} 行，深模块（DeepModule）缺少登记。`)
    } else if (lines > exception.maxLines) {
      failures.push(`${file}: ${lines} 行，超过登记上限 ${exception.maxLines}。`)
    }
  }
  if (lines > REPORT_LINE_THRESHOLD) reports.push(`${file}: ${lines} 行`)

  if (!SOURCE_EXTENSIONS.has(extname(file))) continue
  const functions = measureComplexity(file, text)
  const worst = functions[0]
  const complexityLimit = exception?.maxFunctionComplexity ?? DEFAULT_COMPLEXITY_LIMIT
  if (worst && worst.complexity > complexityLimit) {
    failures.push(
      `${file}:${worst.line} ${worst.name} 圈复杂度 ${worst.complexity}，超过上限 ${complexityLimit}。`,
    )
  }
  sources.push({ file, tokens: tokenSequence(file, text) })
}

const duplication = measureDuplication(sources)
for (const item of duplication.files) {
  if (item.tokens >= 100 && item.ratio > MAX_FILE_DUPLICATION) {
    failures.push(`${item.file}: 令牌重复率 ${(item.ratio * 100).toFixed(1)}%，超过 35%。`)
  }
}
if (duplication.totalTokens >= 100 && duplication.ratio > MAX_AGGREGATE_DUPLICATION) {
  failures.push(`变更源码聚合令牌重复率 ${(duplication.ratio * 100).toFixed(1)}%，超过 15%。`)
}

console.log(`[quality] 基线: ${base || '无'}；生产代码变更文件: ${files.length}`)
console.log(`[quality] 令牌重复率: ${(duplication.ratio * 100).toFixed(1)}% (${duplication.duplicatedTokens}/${duplication.totalTokens})`)
if (reports.length) {
  console.log('[quality] 超过 500 行、需要在交付报告中说明的文件：')
  for (const report of reports) console.log(`  - ${report}`)
}
if (failures.length) {
  console.error('[quality] 未通过：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exitCode = 1
} else {
  console.log('[quality] 通过。')
}
