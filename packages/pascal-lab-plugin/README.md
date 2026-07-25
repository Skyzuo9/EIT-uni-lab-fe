# @unilab/pascal-lab-plugin

Uni-Lab-specific adapter for Pascal Editor. This package owns laboratory scene
semantics and the Pascal plugin implementation. It deliberately does not own
cross-panel application state; that state lives in the `kernel-web` integration
layer.

It contains:

- Pascal node definitions, renderers and editing capabilities for laboratory
  devices and tables.
- Material graph ↔ scene graph conversion with coordinate/unit normalization.
- XACRO, URDF, GLTF/GLB, STL, FBX and OBJ model loading.
- Mount-point metadata, local transform and snapping calculations.

Keep backend clients and application-wide selection stores out of this package.
The application passes authoritative Material aggregates in and receives
placement commands and selected IDs back. Pascal scene state remains a view
projection, never a second Material entity store.
