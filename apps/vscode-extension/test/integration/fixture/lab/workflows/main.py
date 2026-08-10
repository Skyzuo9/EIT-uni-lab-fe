"""VS Code adapter integration fixture."""


def prepare() -> None:
    pass


def run_workflow() -> None:
    source = "rack-a"
    target = "rack-b"
    transfer(source, target)
    record_result()


def transfer(source: str, target: str) -> None:
    print(source, target)


def record_result() -> None:
    pass
