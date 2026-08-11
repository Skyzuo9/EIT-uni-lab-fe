"""用于验证设备包发现、实例化和动作目录的无硬件参考设备。"""

from typing import TypedDict

from unilabos.registry.decorators import action, device


class ReferenceResult(TypedDict):
    value: int


@device(
    id="plc_reference_device",
    category=["test", "plc"],
    displayname="Bundled PLC reference device",
)
class PLCReferenceDevice:
    @action(description="Return a deterministic PLC-Sim acceptance value")
    def read_reference(self, value: int = 1) -> ReferenceResult:
        return {"value": value}
