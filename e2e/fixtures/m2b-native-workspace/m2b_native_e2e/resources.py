from unilabos.registry.decorators import resource


@resource(
    id="plate_96",
    category=["labware", "plate"],
)
def plate_96() -> None:
    """One create_new Inventory identity for MaterialSource admission."""
