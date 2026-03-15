import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	clearPlacementListeners,
	emitPlacement,
	onPlacement,
} from '../../../client/lib/flora/placement-events'

afterEach(() => {
	clearPlacementListeners()
})

describe('placement events', () => {
	it('listener receives emitted events', () => {
		const listener = vi.fn()
		onPlacement(listener)

		emitPlacement({ noteText: 'test', cellId: 'cell-a', mapId: 'map-1' })
		expect(listener).toHaveBeenCalledWith({
			noteText: 'test',
			cellId: 'cell-a',
			mapId: 'map-1',
		})
	})

	it('multiple listeners all receive events', () => {
		const l1 = vi.fn()
		const l2 = vi.fn()
		onPlacement(l1)
		onPlacement(l2)

		emitPlacement({ noteText: 'test', cellId: 'cell-a', mapId: 'map-1' })
		expect(l1).toHaveBeenCalledTimes(1)
		expect(l2).toHaveBeenCalledTimes(1)
	})

	it('unsubscribe stops events', () => {
		const listener = vi.fn()
		const unsub = onPlacement(listener)

		emitPlacement({ noteText: 'first', cellId: 'cell-a', mapId: 'map-1' })
		unsub()
		emitPlacement({ noteText: 'second', cellId: 'cell-a', mapId: 'map-1' })

		expect(listener).toHaveBeenCalledTimes(1)
	})

	it('clearPlacementListeners removes all listeners', () => {
		const listener = vi.fn()
		onPlacement(listener)
		clearPlacementListeners()

		emitPlacement({ noteText: 'test', cellId: 'cell-a', mapId: 'map-1' })
		expect(listener).not.toHaveBeenCalled()
	})
})
