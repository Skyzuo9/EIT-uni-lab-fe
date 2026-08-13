from typing import TypedDict

from unilabos.registry.decorators import action, device


class VerifyReadyResult(TypedDict):
    # ``is_ready`` 是设备动作（Action）返回的确定性就绪状态。
    is_ready: bool


@device(
    id="m2b_mount",
    category=["storage", "stacker"],
    displayname="Stacker A",
)
class M2BMount:
    """提供真实 OS 模板投影所需的固定装置类型。"""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        """接收原生 ROS 包装器的标准构造参数。

        参数：``_args`` 与 ``_kwargs`` 是本测试不消费的驱动构造参数。返回：无。
        异常：无；测试模式不会初始化真实硬件。领域变量仅用于保持装置注册合同。
        """

    @action(displayname="检查装置就绪", description="读取固定装置的就绪状态。")
    def verify_ready(self) -> VerifyReadyResult:
        """返回固定装置的确定性就绪结果。

        参数：无。返回：``is_ready`` 表示装置可以接受调度。异常：无；该测试动作
        （Action）不产生物理效果。领域变量 ``is_ready`` 仅验证模板 Schema 投影。
        """

        return {"is_ready": True}
