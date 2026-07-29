# Lab Map V2 experiment

An isolated laboratory spatial-map experiment. It combines a structural map
document with the existing Material Graph without copying Material entities or
writing draft placements back to the OS.

`materialFrame` is an explicit manual calibration from the OS Material Graph
world frame into the map. It changes only the map projection: Material IDs,
relative poses and geometry continue to come from the current OS aggregate.

`LabMapDraftEquipment` is a separate map-design entity for trying layouts
without mutating the read-only Material Graph. The initial library contains a
liquid handler, robotic arm, centrifuge, incubator, plate reader and workbench.
Drafts can be created, dragged with 100 mm snapping, rotated in 90° steps and
deleted. They intentionally have no `materialId`. Every template currently
provides a lightweight isometric SVG visual shared by the library and the map,
so drafts remain recognizable without creating another WebGL scene. A future
authoritative model URL can replace that preview through the existing Pascal
model runtime instead of hard-coding OS filesystem paths here.

Enable the application panel with:

```text
?experimentalLabMapV2=1
```

The existing 2.5D oblique view and its persisted view-mode key are unchanged.
