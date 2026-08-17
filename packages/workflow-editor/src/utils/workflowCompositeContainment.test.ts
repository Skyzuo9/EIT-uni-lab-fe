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
