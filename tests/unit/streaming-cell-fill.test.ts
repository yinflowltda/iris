import { describe, expect, it } from 'vitest'
import { closeAndParseJson } from '../../worker/do/closeAndParseJson'
import type { AgentAction } from '../../shared/types/AgentAction'
import type { Streaming } from '../../shared/types/Streaming'

/**
 * Tests for the streaming cell fill format parsing.
 *
 * The server detects `{ message, cells }` format and emits `cell_fill` events.
 * These tests verify the incremental JSON parsing behavior that underpins the feature.
 */

describe('closeAndParseJson with cells format', () => {
	it('parses complete cells object', () => {
		const json = '{"message":"Hello","cells":{"past-events":["Lost job","Moved"]}}'
		const result = closeAndParseJson(json)
		expect(result).toEqual({
			message: 'Hello',
			cells: { 'past-events': ['Lost job', 'Moved'] },
		})
	})

	it('parses incomplete cells object (streaming)', () => {
		// Simulates mid-stream: second entry is being typed
		const json = '{"message":"Hello","cells":{"past-events":["Lost job","Move'
		const result = closeAndParseJson(json)
		expect(result).toBeTruthy()
		expect(result.cells['past-events']).toHaveLength(2)
		expect(result.cells['past-events'][0]).toBe('Lost job')
		// Second entry is incomplete but gets auto-closed
		expect(result.cells['past-events'][1]).toBe('Move')
	})

	it('parses with only message so far', () => {
		const json = '{"message":"Looking at your situation'
		const result = closeAndParseJson(json)
		expect(result).toBeTruthy()
		expect(result.message).toBe('Looking at your situation')
	})

	it('parses cells with multiple cell IDs', () => {
		const json =
			'{"message":"Here","cells":{"past-events":["Lost job"],"past-thoughts":["Overwhelmed"'
		const result = closeAndParseJson(json)
		expect(result.cells['past-events']).toEqual(['Lost job'])
		expect(result.cells['past-thoughts']).toEqual(['Overwhelmed'])
	})

	it('parses empty cells object', () => {
		const json = '{"message":"Nothing to add","cells":{}}'
		const result = closeAndParseJson(json)
		expect(result.cells).toEqual({})
	})
})

describe('streaming cell fill diff detection', () => {
	/**
	 * Simulates the server-side logic for detecting new complete cell entries.
	 * During streaming, we only emit entries up to count-1 (last may be incomplete).
	 */
	function getNewCompleteEntries(
		cells: Record<string, string[]>,
		emittedCounts: Map<string, number>,
		isFinal: boolean,
	): Array<{ cellId: string; content: string }> {
		const results: Array<{ cellId: string; content: string }> = []

		for (const [cellId, entries] of Object.entries(cells)) {
			if (!Array.isArray(entries)) continue
			const alreadyEmitted = emittedCounts.get(cellId) ?? 0
			const emitUpTo = isFinal ? entries.length : entries.length - 1

			for (let i = alreadyEmitted; i < emitUpTo; i++) {
				const content = entries[i]
				if (typeof content === 'string' && content.trim().length > 0) {
					results.push({ cellId, content: content.trim() })
				}
			}

			if (emitUpTo > alreadyEmitted) {
				emittedCounts.set(cellId, emitUpTo)
			}
		}

		return results
	}

	it('emits nothing when only one entry exists (may be incomplete)', () => {
		const cells = { 'past-events': ['Lost jo'] }
		const counts = new Map<string, number>()
		const entries = getNewCompleteEntries(cells, counts, false)
		expect(entries).toHaveLength(0)
	})

	it('emits first entry when second entry appears', () => {
		const cells = { 'past-events': ['Lost job', 'Move'] }
		const counts = new Map<string, number>()
		const entries = getNewCompleteEntries(cells, counts, false)
		expect(entries).toEqual([{ cellId: 'past-events', content: 'Lost job' }])
		expect(counts.get('past-events')).toBe(1)
	})

	it('emits remaining entries on final', () => {
		const cells = { 'past-events': ['Lost job', 'Moved'] }
		const counts = new Map<string, number>()
		counts.set('past-events', 1) // first already emitted
		const entries = getNewCompleteEntries(cells, counts, true)
		expect(entries).toEqual([{ cellId: 'past-events', content: 'Moved' }])
	})

	it('handles multiple cells incrementally', () => {
		const counts = new Map<string, number>()

		// First parse: one cell with two entries, another with one
		const cells1 = {
			'past-events': ['Lost job', 'Moved'],
			'past-thoughts': ['Overwhelmed'],
		}
		const entries1 = getNewCompleteEntries(cells1, counts, false)
		expect(entries1).toEqual([{ cellId: 'past-events', content: 'Lost job' }])

		// Second parse: more entries added
		const cells2 = {
			'past-events': ['Lost job', 'Moved', 'New ci'],
			'past-thoughts': ['Overwhelmed', 'Scared'],
		}
		const entries2 = getNewCompleteEntries(cells2, counts, false)
		expect(entries2).toEqual([
			{ cellId: 'past-events', content: 'Moved' },
			{ cellId: 'past-thoughts', content: 'Overwhelmed' },
		])

		// Final: emit everything remaining
		const entries3 = getNewCompleteEntries(cells2, counts, true)
		expect(entries3).toEqual([
			{ cellId: 'past-events', content: 'New ci' },
			{ cellId: 'past-thoughts', content: 'Scared' },
		])
	})
})

describe('parseCellsFormat message emission', () => {
	/**
	 * Simulates the server-side parseCellsFormat logic for message emission.
	 * This is the exact logic from AgentService.parseCellsFormat.
	 */
	function* parseCellsFormat(
		partialObject: any,
		emittedCellCounts: Map<string, number>,
		prevMessageText: string,
		isFinal: boolean,
	): Generator<{ _type: string; text?: string; cellId?: string; content?: string; complete: boolean }> {
		const cells = partialObject.cells
		if (cells && typeof cells === 'object') {
			for (const [cellId, entries] of Object.entries(cells)) {
				if (!Array.isArray(entries)) continue
				const alreadyEmitted = emittedCellCounts.get(cellId) ?? 0
				const emitUpTo = isFinal ? entries.length : entries.length - 1
				for (let i = alreadyEmitted; i < emitUpTo; i++) {
					const content = entries[i] as string
					if (typeof content !== 'string' || content.trim().length === 0) continue
					yield { _type: 'cell_fill', cellId, content: content.trim(), complete: true }
				}
				if (emitUpTo > alreadyEmitted) {
					emittedCellCounts.set(cellId, emitUpTo)
				}
			}
		}
		const messageText = typeof partialObject.message === 'string' ? partialObject.message : ''
		if (messageText !== prevMessageText || (isFinal && messageText.length > 0)) {
			yield { _type: 'message', text: messageText, complete: isFinal }
		}
	}

	it('emits final complete message even when text has not changed (regression)', () => {
		const counts = new Map<string, number>()
		const fullMessage = 'Here is what I see in your situation'

		// Simulate streaming: message grows over multiple iterations
		const events1 = [...parseCellsFormat(
			{ message: 'Here is what', cells: {} },
			counts, '', false,
		)]
		expect(events1).toEqual([{ _type: 'message', text: 'Here is what', complete: false }])

		// Message reaches its final form during streaming
		const events2 = [...parseCellsFormat(
			{ message: fullMessage, cells: { 'past-events': ['Lost job'] } },
			counts, 'Here is what', false,
		)]
		expect(events2).toEqual([
			{ _type: 'message', text: fullMessage, complete: false },
		])

		// Final pass: message text is same as prevMessageText — BUT must still emit complete: true
		const events3 = [...parseCellsFormat(
			{ message: fullMessage, cells: { 'past-events': ['Lost job'] } },
			counts, fullMessage, true,
		)]
		const messageEvents = events3.filter(e => e._type === 'message')
		expect(messageEvents).toHaveLength(1)
		expect(messageEvents[0]).toEqual({
			_type: 'message',
			text: fullMessage,
			complete: true,
		})
	})

	it('emits no message when message is empty on final', () => {
		const counts = new Map<string, number>()
		const events = [...parseCellsFormat({ cells: {} }, counts, '', true)]
		const messageEvents = events.filter(e => e._type === 'message')
		expect(messageEvents).toHaveLength(0)
	})
})
