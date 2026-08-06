import { useCallback, useState } from 'react'
import type {
  DevicePackageInspection,
  DevicePackageUploadResult
} from '@unilab/device-provisioning'

import type { DeviceProvisioningApi } from './deviceProvisioningUi'
import { uiErrorMessage } from './deviceProvisioningUi'
import styles from './DeviceSquarePanel.module.scss'

interface DevicePackageUploadViewProps {
  api: DeviceProvisioningApi
}

/** 通过 Main 受控路径选择和当前 OS CLI 完成设备包检查与发布。 */
export default function DevicePackageUploadView({
  api
}: DevicePackageUploadViewProps): React.JSX.Element {
  const [workspacePath, setWorkspacePath] = useState('')
  const [configPath, setConfigPath] = useState('')
  const [inspection, setInspection] = useState<DevicePackageInspection | null>(null)
  const [result, setResult] = useState<DevicePackageUploadResult | null>(null)
  const [working, setWorking] = useState<'inspect' | 'upload' | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** 用系统目录选择器批准 Workspace 后立即执行只读编译检查。 */
  const handleSelectWorkspace = useCallback(async (): Promise<void> => {
    if (working) return
    setWorking('inspect')
    setError(null)
    setResult(null)
    try {
      const selected = await api.selectPath({ kind: 'packageWorkspace' })
      if (!selected) return
      setWorkspacePath(selected)
      const nextInspection = await api.inspectWorkspace(selected)
      setInspection(nextInspection)
    } catch (reason) {
      setInspection(null)
      setError(uiErrorMessage(reason))
    } finally {
      setWorking(null)
    }
  }, [api, working])

  /** 通过固定文件选择器批准只用于 CLI 上传的 local_config.py。 */
  const handleSelectConfig = useCallback(async (): Promise<void> => {
    if (working) return
    setError(null)
    try {
      const selected = await api.selectPath({ kind: 'packageUploadConfig' })
      if (selected) setConfigPath(selected)
    } catch (reason) {
      setError(uiErrorMessage(reason))
    }
  }, [api, working])

  /** 在用户已经核验编译摘要后复用当前 CLI 上传并确认广场可见性。 */
  const handleUpload = useCallback(async (): Promise<void> => {
    if (!inspection || !workspacePath || !configPath || working) return
    setWorking('upload')
    setError(null)
    setResult(null)
    try {
      const uploaded = await api.uploadWorkspace({ workspacePath, configPath })
      setResult(uploaded)
    } catch (reason) {
      setError(uiErrorMessage(reason))
    } finally {
      setWorking(null)
    }
  }, [api, configPath, inspection, working, workspacePath])

  return (
    <div className={styles.uploadWorkspace}>
      <section className={styles.uploadStep}>
        <div className={styles.stepIndex}>1</div>
        <div className={styles.stepBody}>
          <h2>检查 Package Workspace</h2>
          <p>CLI 会只读构建设备包并输出 PackageCatalog；检查阶段不会上传文件。</p>
          <PathRow
            value={workspacePath}
            empty="尚未选择 Workspace"
            action={working === 'inspect' ? '正在检查…' : '选择并检查'}
            disabled={working !== null}
            onClick={() => void handleSelectWorkspace()}
          />
          {inspection ? <InspectionSummary inspection={inspection} /> : null}
        </div>
      </section>

      <section className={styles.uploadStep} data-disabled={!inspection}>
        <div className={styles.stepIndex}>2</div>
        <div className={styles.stepBody}>
          <h2>选择上传凭据配置</h2>
          <p>
            选择现有 <code>local_config.py</code>。AK/SK 只由 Main 交给 CLI 读取，不进入页面状态或命令参数日志。
          </p>
          <PathRow
            value={configPath}
            empty="尚未选择 local_config.py"
            action="选择配置"
            disabled={!inspection || working !== null}
            onClick={() => void handleSelectConfig()}
          />
        </div>
      </section>

      <section className={styles.uploadStep} data-disabled={!inspection || !configPath}>
        <div className={styles.stepIndex}>3</div>
        <div className={styles.stepBody}>
          <h2>发布到云端设备广场</h2>
          <p>复用现有 storage token、OSS PUT 和设备广场发布链路；版本身份来自检查结果。</p>
          <div className={styles.publishBar}>
            <span>
              {inspection
                ? `${inspection.distribution} ${inspection.version}`
                : '先完成 Workspace 检查'}
            </span>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!inspection || !configPath || working !== null}
              onClick={() => void handleUpload()}
            >
              {working === 'upload' ? '正在上传并确认…' : '上传设备包'}
            </button>
          </div>
          {result ? (
            <div className={result.visibleInSquare ? styles.successBanner : styles.warningBanner} role="status">
              <strong>{result.distribution} {result.version} 已发布</strong>
              <span>
                {result.visibleInSquare
                  ? '云端设备广场已能读取该包。'
                  : '上传已完成，但短暂轮询内尚未在广场列表出现；请稍后刷新广场。'}
              </span>
              <code>{result.artifactDigest}</code>
            </div>
          ) : null}
          {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}
        </div>
      </section>
    </div>
  )
}

/** 展示由 Main 系统选择器批准的路径及下一步动作。 */
function PathRow({
  value,
  empty,
  action,
  disabled,
  onClick
}: {
  value: string
  empty: string
  action: string
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <div className={styles.pathRow}>
      <code title={value}>{value || empty}</code>
      <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={onClick}>
        {action}
      </button>
    </div>
  )
}

/** 展示 CLI 编译出的发布身份与定义数量，供上传前人工核验。 */
function InspectionSummary({
  inspection
}: {
  inspection: DevicePackageInspection
}): React.JSX.Element {
  const definitions = [
    ['设备', inspection.devices.length],
    ['资源', inspection.resources.length],
    ['工作流', inspection.workflows.length]
  ]
  return (
    <div className={styles.inspectionSummary}>
      <div>
        <strong>{inspection.distribution}</strong>
        <span>{inspection.version} · {inspection.namespace}</span>
      </div>
      <dl>
        {definitions.map(([label, count]) => (
          <div key={label}><dt>{label}</dt><dd>{count}</dd></div>
        ))}
      </dl>
      <code title={inspection.catalogDigest}>{inspection.catalogDigest}</code>
    </div>
  )
}
