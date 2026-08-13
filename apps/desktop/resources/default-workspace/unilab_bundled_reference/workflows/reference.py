"""用于验证工作区发现的最小参考工作流。"""

from unilabos.workflow.authoring import workflow_definition


@workflow_definition(
    workflow_uuid="65000000-0000-4000-8000-000000000002",
    displayname="Bundled reference workflow",
)
def bundled_reference_workflow() -> None:
    """桌面安装包的离线工作区验收入口。"""
