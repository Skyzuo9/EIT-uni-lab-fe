import type { CustomParameter } from '../types'
import { buttonClass } from '../uiClasses'
import { WorkstationIcon } from '../WorkstationIcon'
import styles from '../workstation.module.scss'

/** 提供可增加、编辑和移除的名称/值/单位自定义参数组。 */
export function CustomParameterFields({
  value,
  onChange,
}: {
  value: CustomParameter[]
  onChange: (value: CustomParameter[]) => void
}): React.JSX.Element {
  function update(index: number, patch: Partial<CustomParameter>): void {
    onChange(value.map((parameter, parameterIndex) => (parameterIndex === index ? { ...parameter, ...patch } : parameter)))
  }
  return (
    <section className={styles.customParameterFields} aria-label="自定义参数">
      <div className={styles.customParameterHeader}>
        <strong>自定义参数</strong>
        <button
          className={buttonClass('secondary', 'compact')}
          type="button"
          onClick={() => onChange([...value, { name: '', value: '', unit: '' }])}
        >
          <WorkstationIcon name="plus" />
          添加参数
        </button>
      </div>
      <div className={styles.customParameterList}>
        {value.length === 0 ? (
          <div className={styles.customParameterEmpty}>暂无自定义参数</div>
        ) : value.map((parameter, index) => (
          <div className={styles.customParameterRow} key={index}>
            <label>
              <span>名称</span>
              <input value={parameter.name} onChange={(event) => update(index, { name: event.target.value })} required />
            </label>
            <label>
              <span>值</span>
              <input value={parameter.value} onChange={(event) => update(index, { value: event.target.value })} required />
            </label>
            <label>
              <span>单位</span>
              <input value={parameter.unit} onChange={(event) => update(index, { unit: event.target.value })} />
            </label>
            <button
              className={`${buttonClass('secondary', 'icon')} max-[720px]:self-end`}
              type="button"
              onClick={() => onChange(value.filter((_item, parameterIndex) => parameterIndex !== index))}
              aria-label={`移除自定义参数 ${index + 1}`}
            >
              <WorkstationIcon name="trash" />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
