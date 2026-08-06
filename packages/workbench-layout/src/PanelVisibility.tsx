import { createContext, useContext, type ReactNode } from "react";

const PanelVisibilityContext = createContext(true);

/**
 * 将面板标签页当前是否可见传给面板内容。
 *
 * @param active 当前标签页是否是所在面板组的活动标签页。
 * @param children 需要继承可见性的面板内容。
 * @returns 带可见性上下文的 React 节点。
 *
 * 领域约束：隐藏标签页仍可保持挂载，但不得发布跨面板工作流（Workflow）交互身份。
 */
export function PanelVisibilityProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <PanelVisibilityContext.Provider value={active}>
      {children}
    </PanelVisibilityContext.Provider>
  );
}

/**
 * 读取当前面板标签页是否可见。
 *
 * @returns 未处于面板组时默认返回 true；处于面板组时返回活动标签状态。
 */
export function usePanelVisibility(): boolean {
  return useContext(PanelVisibilityContext);
}
