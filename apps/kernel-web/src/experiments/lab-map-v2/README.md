# Experimental Lab Map V2 panel

Open the kernel workbench with:

```text
?experimentalLabMapV2=1
```

The flag adds `experimental-lab-map-v2` to an isolated experimental laboratory
layout and uses a separate panel-layout storage key. Without the flag, the
canonical layout, the existing 2.5D view and its persisted view mode are
unchanged.

This application component only connects the experiment to the existing
Material store, cross-panel selection IDs and a map-design draft store.
Rendering, equipment templates and spatial-map types remain in
`@unilab/material/experiments/lab-map-v2`.

Draft equipment is persisted in:

```text
unilab.lab-map-v2.<map-id>.draft-equipment.v1
```

It is deliberately separate from the OS Material Graph. A draft has no
`materialId` and is not synchronized to the OS until a future write contract is
defined.
