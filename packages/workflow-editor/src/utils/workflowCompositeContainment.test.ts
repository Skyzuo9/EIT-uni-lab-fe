import { describe, expect, it } from 'vitest'

import type { LayoutNode } from './dagLayout'
import {
  projectWorkflowCompositeContainment,
  workflowCompositeConnectionAllowed,
  workflowCompositeConnectionEditable
} from './workflowCompositeContainment'

describe('workflow composite containment', () => {
  it('keeps an expanded parent before its children and encloses their boxes', () => {
    const projected = projectWorkflowCompositeContainment([
      node('before', 0, 0),
      composite('transfer', 180, 120),
      node('pick', 40, 0, 'transfer'),
      node('place', 360, 140, 'transfer'),
      node('after', 180, 360)
    ])
    const byId = new Map(projected.map((node) => [node.id, node]))
    const parent = byId.get('transfer')!
    const pick = byId.get('pick')!
    const place = byId.get('place')!

    expect(projected.every((node) => (
      node.renderSize.width > 0 && node.renderSize.height > 0
    ))).toBe(true)

    expect(projected.indexOf(parent)).toBeLessThan(projected.indexOf(pick))
    expect(pick.parentContainerId).toBe('transfer')
    expect(place.parentContainerId).toBe('transfer')
    expect(parent.compositeContainerSize).toEqual(expect.objectContaining({
      width: expect.any(Number),
      height: expect.any(Number)
    }))
    expect(pick.renderPosition.x).toBeGreaterThanOrEqual(0)
    expect(pick.renderPosition.y).toBeGreaterThanOrEqual(0)
    expect(
      pick.renderPosition.x + 248
    ).toBeLessThanOrEqual(parent.compositeContainerSize!.width)
    expect(
      place.renderPosition.y + 96
    ).toBeLessThanOrEqual(parent.compositeContainerSize!.height)
  })

  it('projects nested composites relative to their immediate visible parent', () => {
    const projected = projectWorkflowCompositeContainment([
      composite('outer', 0, 0),
      node('prepare', 0, 120, 'outer'),
      composite('inner', 320, 120, 'outer'),
      node('dose', 320, 260, 'inner')
    ])
    const byId = new Map(projected.map((node) => [node.id, node]))

    expect(byId.get('inner')?.parentContainerId).toBe('outer')
    expect(byId.get('dose')?.parentContainerId).toBe('inner')
    expect(byId.get('outer')?.compositeContainerSize?.width)
      .toBeGreaterThan(byId.get('inner')!.compositeContainerSize!.width)

    const outer = byId.get('outer')!
    const inner = byId.get('inner')!
    expect(inner.renderPosition.x).toBeGreaterThanOrEqual(0)
    expect(inner.renderPosition.y).toBeGreaterThanOrEqual(0)
    expect(
      inner.renderPosition.x + inner.compositeContainerSize!.width
    ).toBeLessThanOrEqual(outer.compositeContainerSize!.width)
    expect(
      inner.renderPosition.y + inner.compositeContainerSize!.height
    ).toBeLessThanOrEqual(outer.compositeContainerSize!.height)
  })

  it('keeps sequential layers below a nested composite when the parent grows', () => {
    const projected = projectWorkflowCompositeContainment([
      composite('outer', 0, 0),
      composite('inner', 0, 120, 'outer'),
      node('inner-first', 0, 240, 'inner'),
      node('inner-last', 0, 480, 'inner'),
      node('after-inner', 0, 760, 'outer')
    ])
    const byId = new Map(projected.map((node) => [node.id, node]))
    const outer = byId.get('outer')!
    const inner = byId.get('inner')!
    const afterInner = byId.get('after-inner')!

    expect(afterInner.renderPosition.y).toBeGreaterThanOrEqual(
      inner.renderPosition.y + inner.compositeContainerSize!.height + 40
    )
    expect(
      afterInner.renderPosition.y + afterInner.renderSize.height
    ).toBeLessThanOrEqual(outer.compositeContainerSize!.height - 32)
  })

  it('adaptively wraps wide dependency layers inside doubly expanded composites', () => {
    const prepareIds = Array.from({ length: 8 }, (_, index) => `prepare-${index}`)
    const executeIds = Array.from({ length: 5 }, (_, index) => `execute-${index}`)
    const sequentialLinks = [...prepareIds, ...executeIds].flatMap((id) => {
      const siblings = id.startsWith('prepare') ? prepareIds : executeIds
      const index = siblings.indexOf(id)
      return index === siblings.length - 1
        ? []
        : [{ source: id, target: siblings[index + 1]!, type: 'ready' }]
    })
    const projected = projectWorkflowCompositeContainment([
      composite('outer', 0, 0),
      composite('prepare', 0, 120, 'outer'),
      ...prepareIds.map((id, index) =>
        node(id, index * 320, 240, 'prepare')
      ),
      composite('execute', 3200, 120, 'outer'),
      ...executeIds.map((id, index) =>
        node(id, 3200 + index * 320, 240, 'execute')
      )
    ], new Map(), sequentialLinks, 'horizontal')
    const byId = new Map(projected.map((item) => [item.id, item]))
    const outer = byId.get('outer')!
    const prepare = byId.get('prepare')!

    expect(prepare.compositeContainerSize!.width).toBeLessThanOrEqual(1_400)
    expect(
      outer.compositeContainerSize!.width / outer.compositeContainerSize!.height
    ).toBeLessThanOrEqual(6)

    for (const item of projected.filter((candidate) => candidate.parentContainerId)) {
      const parent = byId.get(item.parentContainerId!)!
      expect(item.renderPosition.x).toBeGreaterThanOrEqual(0)
      expect(item.renderPosition.y).toBeGreaterThanOrEqual(0)
      expect(item.renderPosition.x + item.renderSize.width)
        .toBeLessThanOrEqual(parent.compositeContainerSize!.width)
      expect(item.renderPosition.y + item.renderSize.height)
        .toBeLessThanOrEqual(parent.compositeContainerSize!.height)
    }
  })

  it('uses the published PTLC parent_uuid tree and measured child boxes', () => {
    const outer = '9c3e9131-32d0-5dd5-9ca0-1e8bc5f6e274'
    const prepare = '5b1643e4-bcc2-5ded-835c-76d51a6649c5'
    const transfer = 'e749a662-89cc-50da-98a4-6bd56ad4b665'
    const execute = 'a07d6f06-7671-501c-bab9-8763bccf0207'
    const executeChildren = [
      'fcbfe1e4-39b4-5419-b48e-29c48d7eb62e',
      'a6340456-94b2-5eed-a9ce-2880a9707aac',
      'dde65fd2-3961-588f-9a27-c0a8b39fc611',
      'dd819ea4-ab66-58cc-b5e1-ee3729774895',
      'd3cee0fc-c75e-54a0-a41d-828230356e74',
      '6df129de-35dd-57b2-b17a-a22337feb3f9'
    ]
    const projected = projectWorkflowCompositeContainment([
      composite(outer, 400, 1602),
      node(prepare, 432, 1666, outer),
      node(transfer, 728, 1666, outer),
      composite(execute, 432, 1832, outer),
      ...executeChildren.map((id, index) =>
        node(id, 464 + (index % 4) * 296, 1896 + Math.floor(index / 4) * 136, execute)
      )
    ], new Map([
      [prepare, { width: 186, height: 114 }],
      [transfer, { width: 120, height: 126 }],
      ...executeChildren.map((id, index) => [
        id,
        { width: 186, height: index === 5 ? 146 : 83 }
      ] as const)
    ]), [], 'horizontal')
    const byId = new Map(projected.map((item) => [item.id, item]))

    expect(byId.get(prepare)?.parentContainerId).toBe(outer)
    expect(byId.get(transfer)?.parentContainerId).toBe(outer)
    expect(byId.get(execute)?.parentContainerId).toBe(outer)
    executeChildren.forEach((id) => {
      expect(byId.get(id)?.parentContainerId).toBe(execute)
    })

    for (const item of projected.filter((candidate) => candidate.parentContainerId)) {
      const parent = byId.get(item.parentContainerId!)!
      expect(item.renderPosition.x).toBeGreaterThanOrEqual(0)
      expect(item.renderPosition.y).toBeGreaterThanOrEqual(0)
      expect(item.renderPosition.x + item.renderSize.width)
        .toBeLessThanOrEqual(parent.compositeContainerSize!.width)
      expect(item.renderPosition.y + item.renderSize.height)
        .toBeLessThanOrEqual(parent.compositeContainerSize!.height)
    }
  })

  it('moves root siblings away from an expanded container footprint', () => {
    const projected = projectWorkflowCompositeContainment([
      composite('outer', 0, 0),
      node('inside-a', 0, 0, 'outer'),
      node('inside-b', 320, 0, 'outer'),
      node('root-peer', 200, 20)
    ])
    const byId = new Map(projected.map((node) => [node.id, node]))
    const outer = byId.get('outer')!
    const peer = byId.get('root-peer')!

    expect(peer.renderPosition.x).toBeGreaterThanOrEqual(
      outer.renderPosition.x + outer.compositeContainerSize!.width + 32
    )
  })
})

describe('workflow composite boundary connections', () => {
  const nodes = [
    node('outside', 0, 0),
    composite('outer', 0, 0),
    node('first', 0, 0, 'outer'),
    node('second', 0, 0, 'outer'),
    composite('inner', 0, 0, 'outer'),
    node('deep', 0, 0, 'inner')
  ]

  it('allows internal and immediate parent-boundary connections', () => {
    expect(workflowCompositeConnectionAllowed(nodes, 'first', 'second'))
      .toBe(true)
    expect(workflowCompositeConnectionAllowed(nodes, 'outer', 'first'))
      .toBe(true)
    expect(workflowCompositeConnectionAllowed(nodes, 'first', 'outer'))
      .toBe(true)
    expect(workflowCompositeConnectionAllowed(nodes, 'inner', 'deep'))
      .toBe(true)
  })

  it('rejects direct links that skip a composite boundary', () => {
    expect(workflowCompositeConnectionAllowed(nodes, 'outside', 'first'))
      .toBe(false)
    expect(workflowCompositeConnectionAllowed(nodes, 'deep', 'outside'))
      .toBe(false)
    expect(workflowCompositeConnectionAllowed(nodes, 'deep', 'second'))
      .toBe(false)
    expect(workflowCompositeConnectionAllowed(nodes, 'outer', 'deep'))
      .toBe(false)
  })

  it('keeps expanded descendants display-only during canvas authoring', () => {
    expect(workflowCompositeConnectionEditable(nodes, 'first', 'second'))
      .toBe(false)
    expect(workflowCompositeConnectionEditable(nodes, 'outer', 'first'))
      .toBe(false)
    expect(workflowCompositeConnectionEditable(nodes, 'inner', 'deep'))
      .toBe(false)
    expect(workflowCompositeConnectionEditable(nodes, 'outside', 'outer'))
      .toBe(true)
  })
})

function node(
  id: string,
  x: number,
  y: number,
  parentGroupId?: string
): LayoutNode {
  return {
    id,
    name: id,
    type: 'action',
    className: 'Action',
    labNodeType: 'Action',
    x,
    y,
    ...(parentGroupId ? { parentGroupId } : {})
  }
}

function composite(
  id: string,
  x: number,
  y: number,
  parentGroupId?: string
): LayoutNode {
  return {
    ...node(id, x, y, parentGroupId),
    type: 'workflow',
    groupKind: 'subworkflow',
    collapsedByDefault: true,
    descendantNodeIds: []
  }
}
