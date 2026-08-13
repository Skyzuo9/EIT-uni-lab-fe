import type { WorkflowRuntimePort } from '@unilab/services'

import type { WorkflowPanelProps } from './components/WorkflowPanel'

// @ts-expect-error UI1D removes the fallback panel's dead focus callback.
import type { WorkflowStepFocus } from './index'

declare const runtime: WorkflowRuntimePort

const props: WorkflowPanelProps = {
  runtime,
  // @ts-expect-error Persistent authoring owns selection; this seam is retired.
  onStepFocus: () => undefined
}

void props
void (undefined as unknown as WorkflowStepFocus)
