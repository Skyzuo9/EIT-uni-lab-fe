import styles from './material.module.scss'

export function materialScopeClassName(className: string): string {
  return `${styles.scope} ${className}`
}
