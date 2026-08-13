"""Current-composition Uni-Lab-OS fixture for the device unlock browser E2E.

This module is test support only. It mounts the real ``app.web.server`` API and
uses the real process-live WebSocketClient/DeviceActionManager. Fixture-only
routes create and finish holders without restoring a product Run endpoint.
"""

from __future__ import annotations

import os
import time
from typing import Any

import uvicorn
from fastapi import Body

from unilabos.app.communication import CommunicationClientFactory
from unilabos.app.web import server
from unilabos.app.ws_client import JobInfo, JobStatus, WebSocketClient
from unilabos.config.config import BasicConfig
from unilabos.ros.nodes.presets.host_node import HostNode

DEVICE_ID = "TestAction1"
ACTION_NAME = "test_hold"
ACTION_KEY = f"/devices/{DEVICE_ID}/{ACTION_NAME}"


class FixtureHostNode:
    def __init__(self) -> None:
        self.devices_names = {DEVICE_ID: "/devices"}
        self.device_machine_names = {DEVICE_ID: "E2E 测试仪器"}
        self._online_devices = {f"/devices/{DEVICE_ID}"}
        self._action_value_mappings = {
            DEVICE_ID: {
                ACTION_NAME: {
                    "label": "保持动作",
                    "type": "unilabos.e2e.TestHold",
                    "goal_default": {"duration_seconds": 30},
                    "schema": {
                        "properties": {
                            "goal": {
                                "properties": {
                                    "duration_seconds": {
                                        "type": "integer",
                                        "minimum": 1,
                                    }
                                },
                                "required": ["duration_seconds"],
                            },
                            "result": {
                                "properties": {
                                    "completed": {"type": "boolean"}
                                }
                            },
                        }
                    },
                }
            }
        }
        self._device_action_status: dict[str, Any] = {}
        self._subscribed_topics: set[str] = set()
        self._action_clients: dict[str, Any] = {}
        self.device_status: dict[str, Any] = {}
        self.device_status_timestamps: dict[str, Any] = {}
        self.available = True
        self.cancelled_job_ids: list[str] = []

    def cancel_goal(self, job_id: str) -> bool:
        self.cancelled_job_ids.append(job_id)
        return True


def create_fixture_app():
    """组装覆盖设备动作锁与前端启动依赖的人工解锁测试应用。

    Args:
        无显式参数，测试设备身份由模块常量固定。

    Returns:
        挂载正式设备接口与测试持锁路由的 FastAPI 应用。

    Raises:
        组合正式 OS Web 服务失败时向测试启动器传播原始异常。

    Safety:
        测试持锁路由只作用于固定设备；目录与物料空响应仅满足前端启动读取，
        不参与人工解锁或设备锁状态结算。
    """
    BasicConfig.communication_protocol = "websocket"
    BasicConfig.machine_name = "E2E Edge"
    BasicConfig.working_dir = ""
    client = WebSocketClient()
    host_node = FixtureHostNode()
    CommunicationClientFactory._client_cache = client
    HostNode.get_instance = classmethod(  # type: ignore[method-assign]
        lambda cls, timeout=None: host_node
    )

    app = server.setup_server()

    @app.get("/api/v1/workflow-node-templates")
    def list_workflow_node_templates() -> dict[str, Any]:
        """返回当前人工解锁场景不使用的空动作模板目录。

        Args:
            无显式参数。

        Returns:
            符合前端动作目录契约的单页空目录。

        Raises:
            不主动抛出异常。

        Safety:
            空目录不会伪造可执行动作，也不会改变正式设备锁状态。
        """
        return {
            "code": 0,
            "data": {
                "authority": {
                    "authority_id": "e2e-device-manual-unlock",
                    "kind": "local",
                },
                "catalog_fingerprint": "sha256:" + "0" * 64,
                "items": [],
                "total": 0,
                "page": 1,
                "page_size": 100,
            },
        }

    @app.get("/api/v1/materials/graph")
    def get_material_graph() -> dict[str, Any]:
        """返回人工解锁场景不使用的空物料图。

        Args:
            无显式参数。

        Returns:
            符合物料图读取契约的空节点集合。

        Raises:
            不主动抛出异常。

        Safety:
            空图只消除无关启动错误，不提供或释放任何物料、库位或设备声明。
        """
        return {"code": 0, "data": {"nodes": []}}

    @app.get("/api/v1/material-shapes")
    def list_material_shapes() -> dict[str, Any]:
        """返回人工解锁场景不使用的空 2.5D 外形目录。

        Args:
            无显式参数。

        Returns:
            符合外形目录契约的空条目集合。

        Raises:
            不主动抛出异常。

        Safety:
            空目录只满足前端启动读取，不参与动作终止、设备锁或人工解锁。
        """
        return {"code": 0, "data": {"items": []}}

    @app.post(
        "/__e2e/device-actions/{device_id}/{action_name}/holders",
    )
    def create_holder(
        device_id: str,
        action_name: str,
        body: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        if (device_id, action_name) != (DEVICE_ID, ACTION_NAME):
            return {"created": False, "reason": "unknown_action"}
        job_id = str(body.get("jobId") or "")
        task_id = str(body.get("taskId") or "")
        if not job_id or not task_id:
            return {"created": False, "reason": "invalid_identity"}
        should_start, lock_became_busy = client.device_manager.enqueue_job(
            JobInfo(
                job_id=job_id,
                task_id=task_id,
                device_id=device_id,
                notebook_id="",
                action_name=action_name,
                device_action_key=ACTION_KEY,
                status=JobStatus.QUEUE,
                start_time=time.time(),
            )
        )
        return {
            "created": True,
            "shouldStart": should_start,
            "lockBecameBusy": lock_became_busy,
            "currentJobId": client.device_manager.current_action_job_id(
                ACTION_KEY
            ),
        }

    @app.delete(
        "/__e2e/device-actions/{device_id}/{action_name}/holders/{job_id}",
    )
    def finish_holder(
        device_id: str,
        action_name: str,
        job_id: str,
    ) -> dict[str, Any]:
        if (device_id, action_name) != (DEVICE_ID, ACTION_NAME):
            return {"finished": False, "reason": "unknown_action"}
        next_job, lock_became_free = client.device_manager.end_job(job_id)
        return {
            "finished": next_job is None and lock_became_free,
            "currentJobId": client.device_manager.current_action_job_id(
                ACTION_KEY
            ),
        }

    return app


if __name__ == "__main__":
    uvicorn.run(
        create_fixture_app(),
        host="127.0.0.1",
        port=int(os.environ.get("UNILAB_E2E_DEVICE_API_PORT", "18114")),
        log_level="warning",
    )
