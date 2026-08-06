import type { DeviceCardAuthoringProfile } from '@unilab/device-card-sdk'

import type { useDeviceCardWorkbench } from './useDeviceCardWorkbench'
import {
  agentStatusLabel,
  workspaceStateLabel,
  workspaceSummary
} from './useDeviceCardWorkbench'
import styles from './DeviceCardWorkbench.module.scss'
import { deviceInstanceOptionLabel } from './presentation'

type DeviceCardWorkbenchModel = ReturnType<typeof useDeviceCardWorkbench>

export function DeviceCardWorkbenchView({
  model
}: {
  model: DeviceCardWorkbenchModel
}): React.JSX.Element {
  const {
    agentInfo,
    agentReady,
    authoringProfile,
    cards,
    closeWorkspace,
    copyAgentPrompt,
    desktopAvailable,
    devices,
    exportAuthoringKit,
    exportingKit,
    fileAvailable,
    installWorkspace,
    liveMode,
    message,
    openWorkspace,
    prepareAgentProject,
    previewCard,
    previewDescription,
    previewDevice,
    previewRef,
    rebuildWorkspace,
    revealWorkspace,
    selectedCardKey,
    selectedDevice,
    setAuthoringProfile,
    setSelectedCardKey,
    setSelectedDeviceId,
    toggleAgentBridge,
    toggleAgentCli,
    toggleLiveBinding,
    workspace,
    workspaceOperation,
  } = model

  if (!desktopAvailable) {
    return (
      <section className={styles.unavailable}>
        <h1>设备自定义卡片</h1>
        <p>源码目录预览与安装仅在 Electron 桌面端可用。</p>
      </section>
    )
  }

  return (
    <section className={styles.page}>
      <aside className={styles.sidebar}>
        <header className={styles.sidebarHeader}>
          <div>
            <h1>设备卡片</h1>
            <span>{cards.length} 张已安装</span>
          </div>
          <p>创建和预览设备操作界面。</p>
        </header>

        {message ? (
          <p
            className={`${styles.message} ${
              styles[`message_${message.kind}`]
            }`}
            role={message.kind === 'error' ? 'alert' : 'status'}
            aria-live={message.kind === 'error' ? 'assertive' : 'polite'}
          >
            {message.text}
          </p>
        ) : null}

        {workspace ? (
          <section className={styles.workspace} aria-label="本地开发工作区">
            <div className={styles.workspaceHeading}>
              <div>
                <span>当前项目</span>
                <strong>{workspace.projectName}</strong>
              </div>
              <span
                className={`${styles.workspaceState} ${
                  styles[`workspaceState_${workspace.state}`]
                }`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
                aria-label={
                  `${workspaceStateLabel(workspace.state)}。${
                    workspaceSummary(workspace)
                  }`
                }
              >
                {workspaceStateLabel(workspace.state)}
              </span>
            </div>
            <div className={styles.projectPath}>
              <code title={workspace.projectDir}>{workspace.projectDir}</code>
            </div>
            <p className={styles.workspaceSummary}>
              {workspaceSummary(workspace)}
            </p>
            {workspace.diagnostics.length > 0 ? (
              <ul className={styles.diagnostics}>
                {workspace.diagnostics.slice(0, 3).map((diagnostic, index) => (
                  <li
                    key={`${diagnostic.code}-${diagnostic.path ?? index}`}
                    className={styles[`diagnostic_${diagnostic.severity}`]}
                  >
                    <strong>{diagnostic.code}</strong>
                    <span>
                      {diagnostic.path ? `${diagnostic.path} · ` : ''}
                      {diagnostic.message}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={styles.projectActions}>
              <button
                type="button"
                disabled={!agentReady || workspaceOperation !== null}
                onClick={() => void copyAgentPrompt()}
              >
                {agentReady ? '复制 AI 指令' : '请先设置 AI 助手'}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={revealWorkspace}
              >
                打开文件夹
              </button>
            </div>
            <div className={styles.workspaceActions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={workspaceOperation !== null}
                onClick={() => void rebuildWorkspace()}
              >
                {workspaceOperation === 'rebuild' ? '检查中…' : '重新检查'}
              </button>
              <button
                type="button"
                disabled={
                  workspace.state !== 'ready' || workspaceOperation !== null
                }
                onClick={() => void installWorkspace()}
              >
                {workspaceOperation === 'install' ? '安装中…' : '确认并安装'}
              </button>
              <button
                type="button"
                className={styles.ghost}
                disabled={workspaceOperation !== null}
                onClick={() => void closeWorkspace()}
              >
                关闭工作区
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className={styles.creationFlow} aria-label="开始卡片开发">
              <h2>开始开发</h2>

              <div className={styles.fieldGroup}>
                <label>
                  目标设备
                  <select
                    value={selectedDevice?.deviceId ?? ''}
                    onChange={(event) => setSelectedDeviceId(event.target.value)}
                    disabled={devices.length === 0}
                  >
                    {devices.length === 0 ? (
                      <option value="">没有可用设备</option>
                    ) : null}
                    {devices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {deviceInstanceOptionLabel(device)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  开发框架
                  <select
                    value={authoringProfile}
                    onChange={(event) => setAuthoringProfile(
                      event.target.value as DeviceCardAuthoringProfile
                    )}
                  >
                    <option value="vue-web-component-v1">Vue 3</option>
                    <option value="react-web-component-v1">React</option>
                    <option value="web-component-lite-v1">Web Component Lite</option>
                  </select>
                </label>
              </div>

              <div className={styles.creationActions}>
                <button
                  type="button"
                  disabled={!selectedDevice || workspaceOperation !== null}
                  aria-busy={workspaceOperation === 'prepare'}
                  onClick={() => void prepareAgentProject()}
                >
                  {workspaceOperation === 'prepare' ? '正在创建…' : '新建项目'}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={!selectedDevice || workspaceOperation !== null}
                  aria-busy={workspaceOperation === 'open'}
                  onClick={() => void openWorkspace()}
                >
                  {workspaceOperation === 'open' ? '正在打开…' : '打开项目'}
                </button>
              </div>

              <button
                type="button"
                className={styles.textButton}
                disabled={!selectedDevice || !fileAvailable || exportingKit}
                onClick={() => void exportAuthoringKit()}
              >
                {exportingKit ? '正在导出…' : '导出离线开发包'}
              </button>
            </section>

            <section className={styles.libraryPicker} aria-label="已安装卡片预览">
              <label>
                预览已安装卡片
                <select
                  value={selectedCardKey}
                  onChange={(event) => setSelectedCardKey(event.target.value)}
                  disabled={cards.length === 0}
                >
                  {cards.length === 0 ? <option value="">尚未安装卡片</option> : null}
                  {cards.map((card) => (
                    <option key={card.key} value={card.key}>
                      {card.title} / {card.version}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          </>
        )}

        {agentInfo ? (
          <details className={styles.agentTools}>
            <summary>
              <strong>AI 助手</strong>
              <b data-ready={agentReady}>
                {agentStatusLabel(agentInfo)}
              </b>
            </summary>
            <div className={styles.agentToolsBody}>
              <p>供本机 AI 读取项目和检查结果，不能控制真实设备。</p>
              <div className={styles.agentActions}>
                {!agentInfo.cli.compatible ? (
                  <button
                    type="button"
                    disabled={workspaceOperation !== null}
                    onClick={() => void toggleAgentCli()}
                  >
                    {workspaceOperation === 'cli'
                      ? '处理中…'
                      : agentInfo.cli.installed
                        ? '更新工具'
                        : '安装工具'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={workspaceOperation !== null}
                    onClick={() => void toggleAgentBridge()}
                  >
                    {workspaceOperation === 'cli'
                      ? '处理中…'
                      : agentInfo.bridge.enabled
                        ? '停止连接'
                        : '启用连接'}
                  </button>
                )}
                {agentInfo.cli.installed && agentInfo.cli.compatible ? (
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={workspaceOperation !== null}
                    onClick={() => void toggleAgentCli()}
                  >
                    移除工具
                  </button>
                ) : null}
              </div>
            </div>
          </details>
        ) : null}
      </aside>

      <main className={styles.main}>
        <header className={styles.previewHeader}>
          <div>
            <strong>{previewCard?.title ?? '卡片预览'}</strong>
            <span>{previewDescription}</span>
          </div>
          {previewCard && previewDevice ? (
            <div className={styles.liveControls}>
              <span className={styles.modeBadge} data-live={liveMode}>
                {liveMode ? 'LIVE' : 'MOCK'}
              </span>
              <button
                type="button"
                className={liveMode ? styles.stopLive : styles.applyLive}
                disabled={!liveMode && !previewDevice.online}
                aria-pressed={liveMode}
                onClick={toggleLiveBinding}
              >
                {liveMode
                  ? '退出 Live'
                  : `应用到 ${previewDevice.deviceId}`}
              </button>
            </div>
          ) : null}
        </header>
        <div ref={previewRef} className={styles.preview}>
          {!previewCard ? (
            <div className={styles.empty}>
              {workspace
                ? '修复左侧显示的问题后，预览会自动更新。'
                : '创建项目或选择一张已安装卡片后，可在这里预览。'}
            </div>
          ) : null}
        </div>
      </main>
    </section>
  )
}
