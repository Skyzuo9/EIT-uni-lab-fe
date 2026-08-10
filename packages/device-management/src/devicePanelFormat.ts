export function shortIdentifier(value: string): string {
  return value.length > 16
    ? `${value.slice(0, 8)}…${value.slice(-6)}`
    : value
}
