from m2b_native_e2e.resources import plate_96
from unilabos.workflow.authoring import (
    MaterialFlowRole,
    material_source,
    resource_ref,
    workflow_definition,
)


@workflow_definition(
    workflow_uuid="65000000-0000-4000-8000-0000000002b0",
    displayname="M2B Native MaterialSource",
    description="Create one Plate96 through Task-wide Inventory admission.",
)
def m2b_native_material_source() -> None:
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
