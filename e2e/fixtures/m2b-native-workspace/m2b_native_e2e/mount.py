from unilabos.registry.decorators import device


@device(
    id="m2b_mount",
    category=["storage", "stacker"],
    displayname="Stacker A",
)
class M2BMount:
    """Static physical mount; it exposes no executable Action."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        """Accept the native ROS wrapper's standard driver construction args."""
