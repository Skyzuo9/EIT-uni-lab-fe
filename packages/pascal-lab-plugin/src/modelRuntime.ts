import {
  LoaderUtils,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type Material
} from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import URDFLoader from 'urdf-loader'
import { XacroLoader } from 'xacro-parser'

import type { LabDeviceNode } from './schema'

export interface LabModelRuntime {
  resolveUrl?: (
    model: LabDeviceNode['model'],
    node: LabDeviceNode
  ) => string | Promise<string>
  fetchOptions?: () => RequestInit
}

let runtime: LabModelRuntime = {}

export function configureLabModelRuntime(next: LabModelRuntime): void {
  runtime = { ...runtime, ...next }
}

async function resolveUrl(node: LabDeviceNode): Promise<string> {
  return runtime.resolveUrl
    ? runtime.resolveUrl(node.model, node)
    : node.model.path
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, runtime.fetchOptions?.())
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading ${url}`)
  }
  return response.arrayBuffer()
}

function markModel(object: Object3D, nodeId: string): void {
  object.traverse((child) => {
    child.userData = {
      ...child.userData,
      nodeId
    }
  })
}

function fixFileUrls(node: Element | Document): void {
  if (node.nodeType === 1 && (node as Element).tagName === 'mesh') {
    const element = node as Element
    const filename = element.getAttribute('filename')
    if (filename?.startsWith('file://')) {
      element.setAttribute('filename', filename.slice('file://'.length))
    }
  }

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1) fixFileUrls(child as Element)
  }
}

function parseUrdf(
  document: Document,
  workingPath: string,
  nodeId: string
): Object3D {
  fixFileUrls(document)
  const loader = new URDFLoader()
  loader.workingPath = workingPath
  const robot = loader.parse(document)
  markModel(robot, nodeId)
  return robot
}

function buildDeviceXacro(modelPath: string, deviceName: string): string {
  const macroName = modelPath.split('/').slice(-2)[0] || 'device'
  const meshPath = modelPath.includes('/devices/')
    ? modelPath.split('/devices/')[0]
    : modelPath.split('/resources/')[0]

  return `<?xml version="1.0" ?>
<robot xmlns:xacro="http://ros.org/wiki/xacro" name="${deviceName}">
  <link name="world"></link>
  <xacro:include filename="${modelPath}" />
  <xacro:${macroName}
    parent_link="world"
    station_name=""
    device_name="${deviceName}_"
    mesh_path="${meshPath}"
  />
</robot>`
}

function parseXacro(
  input: string,
  workingPath: string,
  nodeId: string
): Promise<Object3D> {
  return new Promise((resolve, reject) => {
    const loader = new XacroLoader()
    ;(loader as unknown as { fetchOptions?: RequestInit }).fetchOptions =
      runtime.fetchOptions?.()
    loader.parse(
      input,
      (document: Document) => {
        resolve(parseUrdf(document, workingPath, nodeId))
      },
      (cause: unknown) => {
        reject(
          new Error(
            `XACRO parse failed: ${
              cause instanceof Error ? cause.message : String(cause)
            }`
          )
        )
      }
    )
  })
}

function loadXacro(url: string, node: LabDeviceNode): Promise<Object3D> {
  if (url.includes('/devices/')) {
    return parseXacro(
      buildDeviceXacro(
        url,
        node.rosDeviceName || node.displayName || 'device'
      ),
      LoaderUtils.extractUrlBase(url),
      node.id
    )
  }

  return new Promise((resolve, reject) => {
    const loader = new XacroLoader()
    ;(loader as unknown as { fetchOptions?: RequestInit }).fetchOptions =
      runtime.fetchOptions?.()
    loader.load(
      url,
      (document: Document) => {
        resolve(
          parseUrdf(
            document,
            LoaderUtils.extractUrlBase(url),
            node.id
          )
        )
      },
      (cause: unknown) => {
        reject(
          new Error(
            `XACRO load failed: ${
              cause instanceof Error ? cause.message : String(cause)
            }`
          )
        )
      }
    )
  })
}

async function loadUrdf(url: string, nodeId: string): Promise<Object3D> {
  const response = await fetch(url, runtime.fetchOptions?.())
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading ${url}`)
  }
  const document = new DOMParser().parseFromString(
    await response.text(),
    'text/xml'
  )
  return parseUrdf(document, LoaderUtils.extractUrlBase(url), nodeId)
}

async function loadGltf(url: string, nodeId: string): Promise<Object3D> {
  const loader = new GLTFLoader(new LoadingManager())
  const draco = new DRACOLoader()
  loader.setDRACOLoader(draco)

  try {
    const result = await loader.loadAsync(url)
    markModel(result.scene, nodeId)
    return result.scene
  } finally {
    draco.dispose()
  }
}

async function loadStl(url: string, nodeId: string): Promise<Object3D> {
  const geometry = new STLLoader().parse(await fetchBuffer(url))
  const material = new MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.15,
    roughness: 0.72
  })
  const mesh = new Mesh(geometry, material)
  markModel(mesh, nodeId)
  return mesh
}

async function loadFbx(url: string, nodeId: string): Promise<Object3D> {
  const object = new FBXLoader().parse(await fetchBuffer(url), url)
  markModel(object, nodeId)
  return object
}

async function loadObj(url: string, nodeId: string): Promise<Object3D> {
  const text = new TextDecoder().decode(await fetchBuffer(url))
  const object = new OBJLoader().parse(text)
  markModel(object, nodeId)
  return object
}

export async function loadLabDeviceModel(
  node: LabDeviceNode
): Promise<Object3D> {
  const url = await resolveUrl(node)
  if (!url) throw new Error('No model URL was provided')

  switch (node.model.format) {
    case 'xacro':
      return loadXacro(url, node)
    case 'urdf':
      return loadUrdf(url, node.id)
    case 'gltf':
      return loadGltf(url, node.id)
    case 'stl':
      return loadStl(url, node.id)
    case 'fbx':
      return loadFbx(url, node.id)
    case 'obj':
      return loadObj(url, node.id)
  }
}

export function disposeLabModel(object: Object3D): void {
  object.traverse((child) => {
    const mesh = child as Mesh
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : []
    materials.forEach((material: Material) => material.dispose())
  })
}
