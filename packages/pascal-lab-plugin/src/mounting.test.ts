import { describe, expect, it } from 'vitest'
import { Group, Vector3 } from 'three'

import {
  calculateHorizontalSnapDistance,
  calculateLocalMountPose,
  findNearestHorizontalMountMatch
} from './mounting'

describe('lab mounting', () => {
  it('uses X/Z distance so elevated links can snap in top view', () => {
    expect(
      calculateHorizontalSnapDistance(
        new Vector3(1, 0, 1),
        new Vector3(1.3, 4, 1.4)
      )
    ).toBeCloseTo(0.5)
  })

  it('calculates a parent-link local pose', () => {
    const parent = new Group()
    parent.position.set(1, 0, 0)
    const child = new Group()
    child.position.set(1.2, 0.4, 0.6)
    parent.updateMatrixWorld(true)
    child.updateMatrixWorld(true)

    const pose = calculateLocalMountPose(child, parent)
    expect(pose.position).toEqual([200, 600, 400])
  })

  it('chooses the nearest accepted mount option', () => {
    const near = new Group()
    near.position.set(0.1, 2, 0.1)
    const far = new Group()
    far.position.set(0.8, 0, 0.8)
    near.updateMatrixWorld(true)
    far.updateMatrixWorld(true)

    const nodes = [
      { id: 'near', object: near },
      { id: 'far', object: far }
    ]
    const result = findNearestHorizontalMountMatch({
      childNode: { id: 'child', object: new Group() },
      childPosition: new Vector3(0, 0, 0),
      candidateNodes: nodes,
      threshold: 1,
      getParentObject: (node) => node.object,
      getMountOptions: () => [
        { link: 'base', label: 'Base' }
      ],
      acceptsChild: () => true,
      findLinkObject: (object) => object
    })

    expect(result?.parentNode.id).toBe('near')
  })
})
