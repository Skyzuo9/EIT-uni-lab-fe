"""F05.4-C 进程外短期库存预留控制夹具。"""

from __future__ import annotations

import json
import sys
from collections.abc import Sequence

from unilabos.app.scheduler.inventory.service import InventoryService
from unilabos.app.scheduler.inventory.store import InventoryStore


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
    """解码命令行并输出唯一 JSON 结果行。

    参数：``arguments`` 必须依次包含库存库路径和任务 UUID。
    返回：成功为零。异常：参数数量非法或释放失败时抛出。
    """

    if len(arguments) != 2:
        raise ValueError("需要 inventory_database 和 workflow_task_uuid")
    result = release_workflow_reservation(arguments[0], arguments[1])
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
