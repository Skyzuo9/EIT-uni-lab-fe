# Local environment

Node-side launch facts shared by the legacy Electron shell and the Theia
Authoring Workbench. This package owns cross-platform Python/Conda discovery
and the validated PLC-Sim process specification; it does not own UI, Electron,
Theia, or a long-lived process.

```text
Electron LocalRuntimeManager ─┐
                             ├─ @unilab/local-environment
Theia WorkbenchSession ──────┘
```

The caller remains the lifecycle authority. Electron can keep its existing
kernel surface without depending on Theia, while browser and desktop Workbench
use the Theia Node backend as their single local-process authority.
