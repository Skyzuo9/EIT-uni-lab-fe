from typing import TypedDict

from m2b_native_e2e.mount import M2BMount
from unilabos.workflow.authoring import device, workflow


class M2BFixedExecutorResult(TypedDict):
    # ``is_ready`` 是固定执行器（Fixed Executor）动作的公开工作流输出。
    is_ready: bool


# ``mount`` 将源码符号绑定到公共物料图中的实际设备物料（Material）UUID。
mount: M2BMount = device("97539b08-24de-5003-8b2e-9eb6e983c68a")


@workflow(
    workflow_uuid="65000000-0000-4000-8000-0000000002c0",
    displayname="M2B 固定执行器投影",
    description="验证实际设备物料与动作模板资源身份保持一致。",
)
def m2b_fixed_executor() -> M2BFixedExecutorResult:
    """声明不启动运行的固定执行器（Fixed Executor）工作流。

    参数：无。返回：``is_ready`` 是装置动作的静态输出。异常：源码只由可信工作流
    编译器解析；不触发真实动作。领域变量 ``checked`` 代表固定装置动作节点结果。
    """

    # [检查装置就绪] 验证固定实际设备物料与动作模板的双投影。
    # unilab:node_uuid=66000000-0000-4000-8000-0000000002c0
    checked = mount.verify_ready()
    return {"is_ready": checked.is_ready}
