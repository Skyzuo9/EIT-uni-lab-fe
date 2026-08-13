import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cloudEnvironmentOption,
  type CloudEnvironment,
  type DevicePackageInspection,
  type DevicePackageUploadResult
} from '@unilab/device-provisioning'

import type { DeviceProvisioningApi } from './deviceProvisioningUi'
import { uiErrorMessage } from './deviceProvisioningUi'
import styles from './DeviceSquarePanel.module.scss'

interface DevicePackageUploadViewProps {
  api: DeviceProvisioningApi
  cloudEnvironment: CloudEnvironment
}

/**
 * 通过 Main 受控路径、一次性 AK/SK 和当前 OS CLI 完成设备包检查与发布。
 *
 * @param props.api Electron Preload 暴露的最小设备包发布端口。
 * @param props.cloudEnvironment 操作台当前选择的固定云端环境。
 * @returns Workspace 检查、非持久凭据输入和发布结果三阶段界面。
 */
export default function DevicePackageUploadView({
  api,
  cloudEnvironment
}: DevicePackageUploadViewProps): React.JSX.Element {
  const [workspacePath, setWorkspacePath] = useState('')
  const [inspection, setInspection] = useState<DevicePackageInspection | null>(null)
  const [result, setResult] = useState<DevicePackageUploadResult | null>(null)
  const [working, setWorking] = useState<'inspect' | 'upload' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const akInput = useRef<HTMLInputElement>(null)
  const skInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 环境变化会改变凭据作用域；清空旧值，避免把上一环境的秘密误用于新目标。
    if (akInput.current) akInput.current.value = ''
    if (skInput.current) skInput.current.value = ''
    setResult(null)
    setError(null)
  }, [cloudEnvironment])

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

  /**
   * 在用户核验编译摘要后，把一次性凭据经 Main/CLI stdin 发布到所选环境。
   *
   * @returns 发布与同环境可见性确认完成后结束；SK 始终在结束时清空。
   */
  const handleUpload = useCallback(async (): Promise<void> => {
    if (!inspection || !workspacePath || working) return
    const ak = akInput.current?.value.trim() ?? ''
    const sk = skInput.current?.value.trim() ?? ''
    if (!ak || !sk) {
      setError('请输入当前云端环境对应的 Lab AK 和 SK')
      return
    }
    setWorking('upload')
    setError(null)
    setResult(null)
    try {
      const uploaded = await api.uploadWorkspace({
        workspacePath,
        cloudEnvironment,
        ak,
        sk
      })
      setResult(uploaded)
    } catch (reason) {
      setError(uiErrorMessage(reason))
    } finally {
      if (skInput.current) skInput.current.value = ''
      setWorking(null)
    }
  }, [api, cloudEnvironment, inspection, working, workspacePath])

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
          <h2>配置云端上传凭据</h2>
          <p>
            AK/SK 仅用于本次发布，通过 Main 交给 CLI stdin；不会写入 local_config.py、命令参数或本地接入记录。
          </p>
          <div className={styles.credentialTarget}>
            发布目标：<strong>{environmentLabel(cloudEnvironment)}</strong>
          </div>
          <div className={styles.credentialGrid}>
            <label>
              <span>Lab AK</span>
              <input
                ref={akInput}
                type="text"
                autoComplete="off"
                spellCheck={false}
                disabled={!inspection || working !== null}
                placeholder="请输入 Access Key"
              />
            </label>
            <label>
              <span>Lab SK</span>
              <input
                ref={skInput}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                disabled={!inspection || working !== null}
                placeholder="请输入 Secret Key"
              />
            </label>
          </div>
        </div>
      </section>

      <section className={styles.uploadStep} data-disabled={!inspection}>
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
              disabled={!inspection || working !== null}
              onClick={() => void handleUpload()}
            >
              {working === 'upload' ? '正在上传并确认…' : '上传设备包'}
            </button>
          </div>
          {result ? (
            <div className={result.visibleInSquare ? styles.successBanner : styles.warningBanner} role="status">
              <strong>{result.distribution} {result.version} 已发布</strong>
              <span>
                发布环境：{environmentLabel(result.cloudEnvironment)}。
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

/**
 * 把固定云端环境身份投影成上传确认区的目标名称。
 *
 * @param environment 用户在操作台顶部选择的云端环境。
 * @returns 包含环境用途和主机名的中文确认文字。
 */
function environmentLabel(environment: CloudEnvironment): string {
  const option = cloudEnvironmentOption(environment)
  return `${option.label} · ${option.host}`
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
