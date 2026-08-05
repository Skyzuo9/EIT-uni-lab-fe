from typing import TypedDict

from m2b_native_e2e.resources import plate_96
from unilabos.registry.placeholder_type import ResourceSlot
from unilabos.workflow.authoring import (
    MaterialFlowRole,
    material_source,
    resource_ref,
    workflow,
)


class M2BNativeMaterialSourceResult(TypedDict):
    # ``sample`` 是工作流（Workflow）输出的物料占位符（ResourceSlot）。
    sample: ResourceSlot


@workflow(
    workflow_uuid="65000000-0000-4000-8000-0000000002b0",
    displayname="M2B Native MaterialSource",
    description="通过工作流任务级库存准入准备一块 Plate96。",
)
def m2b_native_material_source() -> M2BNativeMaterialSourceResult:
    """声明可由浏览器改写的物料来源（MaterialSource）。

    参数：无。返回：``sample`` 是准入成功后传递的物料占位符（ResourceSlot）。
    异常：源码只由可信工作流编译器静态解析；无运行时异常。领域变量
    ``sample`` 表示本工作流唯一的业务物料传递身份。
    """

    # [准备物料] 为任务级库存准入声明一块实验孔板。
    # unilab:node_uuid=66000000-0000-4000-8000-0000000002b0
    sample = material_source(
        resource_template=plate_96,
        mode="create_new",
        mount=resource_ref("97539b08-24de-5003-8b2e-9eb6e983c68a"),
        material_uuid=None,
        site="1962ab7c-b006-5e44-a1bd-9b1fde81d529",
        slot_range=None,
        flow_role=MaterialFlowRole.CONSUMABLE,
    )
    return {"sample": sample}
