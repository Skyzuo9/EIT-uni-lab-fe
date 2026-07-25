/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 工作流方向示例数据(JSON 工作流),对齐大 web 导出格式
 * Context: data.nodes 带 pose 坐标 + param;由 parseWorkflowJson 按值推断参数表单
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */

// 示例 JSON 工作流:对齐大 web 导出格式(data.nodes 带 pose 坐标 + param,edges 带 handle)
// 节点 param 无内置 Schema,由 parseWorkflowJson 按值推断表单
export const SAMPLE_WORKFLOW_JSON = `{
  "target_lab_uuid": "57c54aba-097f-45e2-8bea-b9c75a256947",
  "name": "物料扣减人工流示例",
  "data": {
    "workflow_uuid": "259ab91e-020e-430a-9d63-549289df32e5",
    "workflow_name": "物料扣减人工流示例",
    "tags": ["示例", "物料扣减"],
    "nodes": [
      {
        "uuid": "n1-apply-deduct",
        "name": "1. 申请扣减物料",
        "type": "ILab",
        "pose": { "position": { "x": -470, "y": -75, "z": 0 } },
        "param": {
          "device_id": "/PRCXI",
          "slot_on_deck": "A1",
          "deduct_quantity": 1
        },
        "footer": "apply_deduct_resource-host_node",
        "device_name": "host_node",
        "lab_node_type": "Device",
        "template_name": "apply_deduct_resource"
      },
      {
        "uuid": "n2-set-substance",
        "name": "2. 设置内容物(1000uL水)",
        "type": "ILab",
        "pose": { "position": { "x": -122, "y": 208, "z": 0 } },
        "param": {
          "amounts": [1000],
          "is_solid": [false],
          "substance_names": ["water"]
        },
        "footer": "set_substance-host_node",
        "device_name": "host_node",
        "lab_node_type": "Device",
        "template_name": "set_substance"
      },
      {
        "uuid": "n3-manual-1",
        "name": "3. 人工搬运闸门#1",
        "type": "manual_confirm",
        "pose": { "position": { "x": 250, "y": -35, "z": 0 } },
        "param": {
          "site": "",
          "target_device": "",
          "timeout_seconds": 3600
        },
        "footer": "transfer_manual-host_node",
        "device_name": "host_node",
        "lab_node_type": "Device",
        "template_name": "transfer_manual"
      },
      {
        "uuid": "n4-manual-2",
        "name": "4. 人工搬运闸门#2",
        "type": "manual_confirm",
        "pose": { "position": { "x": 611, "y": -30, "z": 0 } },
        "param": {
          "site": "",
          "target_device": "",
          "timeout_seconds": 3600
        },
        "footer": "transfer_manual-host_node",
        "device_name": "host_node",
        "lab_node_type": "Device",
        "template_name": "transfer_manual"
      },
      {
        "uuid": "n5-transfer",
        "name": "5. 系统转移入库",
        "type": "ILab",
        "pose": { "position": { "x": 951, "y": -33, "z": 0 } },
        "param": {
          "site": "A1",
          "target_device": ""
        },
        "footer": "transfer_resource-host_node",
        "device_name": "host_node",
        "lab_node_type": "Device",
        "template_name": "transfer_resource"
      }
    ],
    "edges": [
      { "source_node_uuid": "n1-apply-deduct", "target_node_uuid": "n2-set-substance", "source_handle_key": "resource", "target_handle_key": "resource" },
      { "source_node_uuid": "n2-set-substance", "target_node_uuid": "n3-manual-1", "source_handle_key": "resource", "target_handle_key": "resource" },
      { "source_node_uuid": "n3-manual-1", "target_node_uuid": "n4-manual-2", "source_handle_key": "resource", "target_handle_key": "resource" },
      { "source_node_uuid": "n4-manual-2", "target_node_uuid": "n5-transfer", "source_handle_key": "resource", "target_handle_key": "resource" }
    ]
  }
}
`
