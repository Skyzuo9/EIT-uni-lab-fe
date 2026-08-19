import {
  BoxGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Material,
  Vector3
} from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildDeviceXacro,
  cloneGltfSubtree,
  loadLabDeviceModel,
  resolveModelFrameRotation,
  resolveModelDirectory,
  shouldInstantiateXacro
} from './modelRuntime'
import { LabDeviceNodeSchema } from './schema'

describe('Pascal model runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 验证挂到父 URDF 命名连杆的机械臂不会重复执行 Z-up 轴转换。 */
  function assertNestedUrdfKeepsParentFrame(): void {
    const childRotation = resolveModelFrameRotation(
      'urdf',
      'rail',
      'rail_rail_carriage'
    )
    expect(childRotation).toBeUndefined()
    expect(resolveModelFrameRotation('urdf', null, null)).toEqual([
      -Math.PI / 2,
      0,
      0
    ])

    // 父地轨已经把 URDF Z-up 转为场景 Y-up；子机械臂不得再转一次。
    const parentFrame = new Matrix4().makeRotationX(-Math.PI / 2)
    const childFrame = new Matrix4().makeRotationFromEuler(
      new Euler(...(childRotation ?? [0, 0, 0]), 'XYZ')
    )
    const worldUp = new Vector3(0, 0, 1)
      .applyMatrix4(childFrame)
      .applyMatrix4(parentFrame)
    expect(worldUp.x).toBeCloseTo(0)
    expect(worldUp.y).toBeCloseTo(1)
    expect(worldUp.z).toBeCloseTo(0)
  }

  it(
    'keeps a URDF child upright when mounted to a parent URDF link',
    assertNestedUrdfKeepsParentFrame
  )

  it('keeps a single STL material renderable when applying a tint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(minimalBinaryStl()))
    )
    const node = LabDeviceNodeSchema.parse({
      id: 'plate',
      type: 'lab-device',
      materialNodeId: 'plate',
      model: {
        path: 'http://127.0.0.1/model.stl',
        format: 'stl',
        color: '#22c55e'
      }
    })

    const object = await loadLabDeviceModel(node)
    expect(object).toBeInstanceOf(Mesh)
    const material = (object as Mesh).material
    expect(Array.isArray(material)).toBe(false)
    expect(
      (material as Material & { color: { getHexString(): string } }).color
        .getHexString()
    ).toBe('22c55e')
  })

  it('clones only the selected GLB subtree and normalizes its root translation', () => {
    const scene = new Group()
    const cell = new Group()
    cell.name = 'CELL'
    cell.userData.name = 'CELL'
    const station = new Group()
    station.name = 'STATION_A'
    station.userData.name = 'STATION_A'
    station.position.set(4, 5, 6)
    station.rotation.set(0.1, 0.2, 0.3)
    const selectedMesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial()
    )
    selectedMesh.name = 'selected-mesh'
    station.add(selectedMesh)
    const movableItem = new Group()
    movableItem.name = 'MOVABLE_ITEM'
    movableItem.userData.name = 'MOVABLE_ITEM'
    movableItem.add(
      new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshStandardMaterial())
    )
    station.add(movableItem)
    cell.add(station)
    scene.add(cell)
    const sibling = new Mesh(
      new BoxGeometry(2, 2, 2),
      new MeshStandardMaterial()
    )
    sibling.name = 'whole-machine-sibling'
    scene.add(sibling)
    const associations = new Map([[station, { nodes: 7 }]])
    const gltf = {
      scene,
      parser: { associations }
    } as unknown as GLTF

    const clone = cloneGltfSubtree(gltf, {
      kind: 'gltf_subtree',
      nodeIndex: 7,
      nodePath: 'CELL/STATION_A',
      rootTransform: 'reset_translation',
      excludeNodePaths: ['CELL/STATION_A/MOVABLE_ITEM']
    })

    expect(clone.name).toBe('STATION_A')
    expect(clone.position.toArray()).toEqual([0, 0, 0])
    expect(clone.rotation.x).toBeCloseTo(station.rotation.x, 12)
    expect(clone.rotation.y).toBeCloseTo(station.rotation.y, 12)
    expect(clone.rotation.z).toBeCloseTo(station.rotation.z, 12)
    expect(clone.getObjectByName('selected-mesh')).toBeTruthy()
    expect(clone.getObjectByName('whole-machine-sibling')).toBeUndefined()
    expect(clone.getObjectByName('MOVABLE_ITEM')).toBeUndefined()
    expect(station.getObjectByName('MOVABLE_ITEM')).toBe(movableItem)
    const clonedMesh = clone.getObjectByName('selected-mesh') as Mesh
    expect(clonedMesh.geometry).not.toBe(selectedMesh.geometry)
    expect(clonedMesh.material).not.toBe(selectedMesh.material)
  })

  it('uses the projected macro and model directory for packaged Xacro', () => {
    const source = buildDeviceXacro(
      'http://127.0.0.1:8014/api/v1/material-models/lab/device.xacro',
      'mixer robot',
      'szlab_mixer_robot',
      'http://127.0.0.1:8014/api/v1/material-models/lab/models'
    )

    expect(source).toContain('<xacro:szlab_mixer_robot')
    expect(source).toContain(
      'mesh_path="http://127.0.0.1:8014/api/v1/material-models/lab/models"'
    )
  })

  it('resolves a package-relative mesh directory against the Edge origin', () => {
    expect(
      resolveModelDirectory(
        'http://127.0.0.1:8014/api/v1/material-models/lab/models/device.xacro',
        '/api/v1/material-models/lab/models'
      )
    ).toBe('http://127.0.0.1:8014/api/v1/material-models/lab/models')
  })

  it('instantiates declared macros from packaged resource Xacro files', () => {
    expect(
      shouldInstantiateXacro(
        'http://127.0.0.1:8014/api/v1/material-models/lab/resources/beaker/models/resource.xacro',
        'szlab_beaker_500ml'
      )
    ).toBe(true)
    expect(
      shouldInstantiateXacro(
        'http://127.0.0.1:8014/api/v1/material-models/lab/resources/plain/models/resource.xacro'
      )
    ).toBe(false)
  })

  it('distinguishes packaged Xacro libraries from complete robot documents', () => {
    const packagedPath =
      'http://127.0.0.1:8014/api/v1/material-models/lab/devices/model.xacro'
    expect(
      shouldInstantiateXacro(
        packagedPath,
        undefined,
        '<robot xmlns:xacro="http://ros.org/wiki/xacro"><xacro:macro name="device"><link name="body" /></xacro:macro></robot>'
      )
    ).toBe(true)
    expect(
      shouldInstantiateXacro(
        packagedPath,
        undefined,
        '<robot xmlns:xacro="http://ros.org/wiki/xacro"><link name="body" /></robot>'
      )
    ).toBe(false)
  })
})

function minimalBinaryStl(): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + 50)
  const view = new DataView(buffer)
  view.setUint32(80, 1, true)
  const vertices = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0]
  ]
  vertices.forEach((vertex, vertexIndex) => {
    vertex.forEach((value, axisIndex) => {
      view.setFloat32(
        84 + 12 + vertexIndex * 12 + axisIndex * 4,
        value,
        true
      )
    })
  })
  return buffer
}
