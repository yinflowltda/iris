import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { type TLShapeId, useEditor, useValue } from 'tldraw'
import { getFramework } from '../lib/frameworks/framework-registry'
import {
	classifyNoteBatch,
	type NoteClassificationEntry,
	type NoteDescriptor,
} from '../lib/prisma/note-classifier'
import { usePrisma } from '../lib/prisma/use-prisma'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CellSuggestion {
	shapeId: string
	currentCellId: string
	currentLabel: string
	suggestedCellId: string
	suggestedLabel: string
	similarity: number
}

// ─── Pure logic (exported for testing) ───────────────────────────────────────

/** Extract note descriptors from a mandala's state using the editor. */
export function extractDescriptorsFromMandala(
	editor: { getShape: (id: TLShapeId) => any; getShapeUtil: (shape: any) => any },
	state: Record<string, { contentShapeIds: string[] }>,
): NoteDescriptor[] {
	const descriptors: NoteDescriptor[] = []
	for (const cellState of Object.values(state)) {
		for (const shapeId of cellState.contentShapeIds) {
			const fullId = `shape:${shapeId}` as TLShapeId
			const shape = editor.getShape(fullId)
			if (!shape) continue
			const util = editor.getShapeUtil(shape)
			const text = util.getText(shape) ?? ''
			descriptors.push({ shapeId: shapeId as string, text })
		}
	}
	return descriptors
}

/** Minimum cosine similarity required to show a suggestion. Below this, the match is too weak. */
const MIN_SUGGESTION_SIMILARITY = 0.25

/** Convert misplaced entries into UI-ready suggestions with labels. */
export function buildSuggestions(
	misplaced: NoteClassificationEntry[],
	treeDef: { root: { id: string; label: string; children?: any[] } },
): CellSuggestion[] {
	const labelMap = new Map<string, string>()
	function walk(node: { id: string; label: string; children?: any[] }) {
		labelMap.set(node.id, node.label)
		if (node.children) for (const child of node.children) walk(child)
	}
	walk(treeDef.root)

	return misplaced
		.filter(
			(e) =>
				e.matches.length > 0 &&
				e.currentCellId !== null &&
				e.matches[0].similarity >= MIN_SUGGESTION_SIMILARITY,
		)
		.map((e) => ({
			shapeId: e.shapeId,
			currentCellId: e.currentCellId!,
			currentLabel: labelMap.get(e.currentCellId!) ?? e.currentCellId!,
			suggestedCellId: e.matches[0].cellId,
			suggestedLabel: e.matches[0].label,
			similarity: e.matches[0].similarity,
		}))
}

// ─── Suggestion label component ──────────────────────────────────────────────

function SuggestionLabel({
	shapeId,
	suggestedLabel,
	onDismiss,
}: {
	shapeId: string
	suggestedLabel: string
	onDismiss: (shapeId: string) => void
}) {
	const editor = useEditor()
	const bounds = useValue(
		`suggestion-bounds-${shapeId}`,
		() => editor.getShapePageBounds(`shape:${shapeId}` as TLShapeId),
		[editor, shapeId],
	)

	if (!bounds) return null

	return (
		<div
			className="cell-suggestion-label"
			style={{
				position: 'absolute',
				left: bounds.x + bounds.w / 2,
				top: bounds.y - 4,
				transform: 'translate(-50%, -100%) scale(var(--tl-scale))',
				transformOrigin: 'bottom center',
			}}
		>
			<span className="cell-suggestion-text">
				Try <strong>{suggestedLabel}</strong>
			</span>
			<button
				type="button"
				className="cell-suggestion-dismiss"
				onPointerDown={(e) => {
					e.stopPropagation()
					onDismiss(shapeId)
				}}
			>
				&times;
			</button>
		</div>
	)
}

// ─── Main overlay ────────────────────────────────────────────────────────────

export const CellSuggestionOverlay = memo(function CellSuggestionOverlay() {
	const editor = useEditor()
	const prisma = usePrisma()
	const [suggestions, setSuggestions] = useState<CellSuggestion[]>([])
	const dismissedRef = useRef<Set<string>>(new Set())
	const classifyingRef = useRef(false)

	// Watch mandala state changes reactively
	const mandala = useValue(
		'mandala-shape',
		() =>
			editor.getCurrentPageShapes().find((s) => s.type === 'mandala') as MandalaShape | undefined,
		[editor],
	)
	const mandalaState = useValue('mandala-state', () => mandala?.props.state, [mandala])
	const mandalaId = mandala?.id
	const frameworkId = mandala?.props.frameworkId

	const handleDismiss = useCallback((shapeId: string) => {
		dismissedRef.current.add(shapeId)
		setSuggestions((prev) => prev.filter((s) => s.shapeId !== shapeId))
	}, [])

	// Re-classify when state changes
	useEffect(() => {
		if (!prisma.isReady || !mandalaState || !frameworkId || !mandalaId) {
			setSuggestions([])
			return
		}

		// Debounce: don't re-classify while already running
		if (classifyingRef.current) return

		const framework = getFramework(frameworkId)
		const treeDef = framework.treeDefinition
		if (!treeDef) return

		const descriptors = extractDescriptorsFromMandala(editor, mandalaState as any)
		if (descriptors.length === 0) {
			setSuggestions([])
			return
		}

		classifyingRef.current = true
		classifyNoteBatch(descriptors, mandalaState as any, treeDef, prisma.embed)
			.then((result) => {
				const newSuggestions = buildSuggestions(result.misplaced, treeDef).filter(
					(s) => !dismissedRef.current.has(s.shapeId),
				)
				setSuggestions(newSuggestions)
			})
			.catch(() => {
				// Silent failure — suggestions are non-critical
			})
			.finally(() => {
				classifyingRef.current = false
			})
	}, [mandalaState, prisma.isReady, prisma.embed, frameworkId, mandalaId, editor])

	if (suggestions.length === 0) return null

	return (
		<>
			{suggestions.map((s) => (
				<SuggestionLabel
					key={s.shapeId}
					shapeId={s.shapeId}
					suggestedLabel={s.suggestedLabel}
					onDismiss={handleDismiss}
				/>
			))}
		</>
	)
})
