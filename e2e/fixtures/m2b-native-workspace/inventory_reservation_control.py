"""F05.4-C 进程外短期库存预留控制夹具。"""

from __future__ import annotations

import json
import sys
from collections.abc import Sequence

from unilabos.app.scheduler.inventory.domain import MaterialRequirement
from unilabos.app.scheduler.inventory.service import InventoryService
from unilabos.app.scheduler.inventory.store import InventoryStore


def reserve_workflow_material(
    inventory_database: str,
    workflow_task_uuid: str,
    workflow_node_uuid: str,
    material_uuid: str,
) -> dict[str, object]:
    """通过生产库存服务为测试持有者建立一份真实短期预留。

    参数：库存库、工作流任务（WorkflowTask）、来源节点和实际物料 UUID 都由
    进程外夹具显式传入。返回：``reserve_workflow`` 的标准领域结果。异常：物料
    不可用或库存服务失败时原样传播。
    """

    store = InventoryStore(inventory_database)
    try:
        service = InventoryService(store)
        return service.reserve_workflow(
            workflow_task_uuid,
            {
                workflow_node_uuid: [
                    MaterialRequirement(instance_uuid=material_uuid)
                ]
            },
            actor="f05_e2e_fixture",
            causation_id=f"f05-reserve:{workflow_task_uuid}",
        )
    finally:
        store.close()


def release_workflow_reservation(
    inventory_database: str,
    workflow_task_uuid: str,
) -> dict[str, object]:
    """通过生产库存服务释放工作流任务的全部活跃预留。

    参数：``inventory_database`` 是原生 OS 正在使用的 SQLite 库；
    ``workflow_task_uuid`` 是持有预留的工作流任务（WorkflowTask）。
    返回：``release_workflow`` 的标准领域结果。异常：库存库或服务失败时原样传播。
    """

    store = InventoryStore(inventory_database)
    try:
        service = InventoryService(store)
        return service.release_workflow(
            workflow_task_uuid,
            reason="f05_e2e_admission_retry",
            actor="f05_e2e_fixture",
            causation_id=f"f05-release:{workflow_task_uuid}",
        )
    finally:
        store.close()


def main(arguments: Sequence[str]) -> int:
    """解码预留控制命令并输出唯一 JSON 结果行。

    参数：``reserve`` 后依次接库存库、任务、来源节点和物料 UUID；``release``
    后接库存库和任务 UUID。返回：成功为零。异常：命令、参数数量或库存操作
    非法时抛出。
    """

    if len(arguments) == 5 and arguments[0] == "reserve":
        result = reserve_workflow_material(*arguments[1:])
    elif len(arguments) == 3 and arguments[0] == "release":
        result = release_workflow_reservation(arguments[1], arguments[2])
    else:
        raise ValueError("需要 reserve/release 及其完整短期预留参数")
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
