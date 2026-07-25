const MATERIAL_REFERENCE_KEYS = new Set([
  'materialid',
  'materialids',
  'materialuuid',
  'materialuuids'
])

export function materialIdsFromWorkflowArgs(
  args: Readonly<Record<string, unknown>>
): string[] {
  const result = new Set<string>()
  visit(args, result)
  return [...result]
}

function visit(value: unknown, result: Set<string>, key = ''): void {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (MATERIAL_REFERENCE_KEYS.has(normalizedKey)) {
    addIds(value, result)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) visit(item, result)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [childKey, child] of Object.entries(value)) {
    visit(child, result, childKey)
  }
}

function addIds(value: unknown, result: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) addIds(item, result)
    return
  }
  if (typeof value === 'string' && value.trim()) {
    result.add(value.trim())
  }
}
