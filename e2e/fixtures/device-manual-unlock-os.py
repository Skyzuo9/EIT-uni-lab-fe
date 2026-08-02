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
