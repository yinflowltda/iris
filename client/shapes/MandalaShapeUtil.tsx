import { useCallback, useEffect, useRef, useState } from 'react'
import {
	Box,
	Circle2d,
	createShapeId,
	type RecordProps,
	resizeBox,
	ShapeUtil,
	type SvgExportContext,
	T,
	type TLBaseShape,
	type TLResizeInfo,
	useEditor,
	type VecLike,
} from 'tldraw'
import type { MandalaArrowRecord, MandalaState } from '../../shared/types/MandalaTypes'
import { ZoomModeToggle } from '../components/ZoomModeToggle'
import { setActiveMandalaId } from '../lib/frameworks/active-framework'
import { EMOTIONS_MAP } from '../lib/frameworks/emotions-map'
import { getFramework } from '../lib/frameworks/framework-registry'
import {
	computeMandalaOuterRadius,
	getCellAtPoint,
	getCellAtPointFromTree,
	getCellBoundingBox,
	getCellBoundingBoxFromTree,
	makeEmptyState,
} from '../lib/mandala-geometry'
import { repositionNotesForZoom } from '../lib/mandala-snap'
import { isNodeInSubtree } from '../lib/sunburst-layout'
import type { ArcAnimationState } from '../lib/sunburst-zoom'
import { SunburstSvg } from './SunburstSvg'

// ─── Shape type ──────────────────────────────────────────────────────────────

export type MandalaShapeProps = {
	frameworkId: string
	w: number
	h: number
	state: MandalaState
	arrows: MandalaArrowRecord[]
	arrowsVisible: boolean
	zoomedNodeId: string | null
	zoomMode: string
}

declare module 'tldraw' {
	interface TLGlobalShapePropsMap {
		mandala: MandalaShapeProps
	}
}

export type MandalaShape = TLBaseShape<'mandala', MandalaShapeProps>

// ─── Interactive wrapper (needs useEditor) ───────────────────────────────────

const NOTE_TARGET_SCREEN_SIZE = 250
const NOTE_MIN_SCALE = 0.5
const NOTE_MAX_SCALE = 2.5

function getNoteScaleForZoom(zoom: number) {
	const scale = NOTE_TARGET_SCREEN_SIZE / (200 * zoom)
	return Math.min(NOTE_MAX_SCALE, Math.max(NOTE_MIN_SCALE, scale))
}

type MandalaPointInShapeSpaceEditor = {
	getPointInShapeSpace(shape: MandalaShape, point: VecLike): VecLike
}

function getLocalCellFromPage(
	editor: MandalaPointInShapeSpaceEditor,
	shape: MandalaShape,
	pagePoint: VecLike,
): string | null {
	const localPoint = editor.getPointInShapeSpace(shape, pagePoint)
	const outerR = computeMandalaOuterRadius(shape.props.w, shape.props.h)
	const localCenter = { x: shape.props.w / 2, y: shape.props.h / 2 }
	const framework = getFramework(shape.props.frameworkId)
	// Use tree-based hit-testing when available (matches sunburst rendering)
	if (framework.treeDefinition) {
		return getCellAtPointFromTree(framework.treeDefinition, localCenter, outerR, localPoint)
	}
	return getCellAtPoint(framework.definition, localCenter, outerR, localPoint)
}

function MandalaInteractive({ shape }: { shape: MandalaShape }) {
	const editor = useEditor()
	const [hoveredCell, setHoveredCell] = useState<string | null>(null)
	const hoveredCellRef = useRef<string | null>(null)

	useEffect(() => {
		function onPointerMove(e: PointerEvent) {
			const mandala = editor.getShape<MandalaShape>(shape.id)
			if (!mandala) {
				if (hoveredCellRef.current !== null) {
					hoveredCellRef.current = null
					setHoveredCell(null)
				}
				return
			}

			const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY })
			const cellId = getLocalCellFromPage(editor, mandala, pagePoint)

			if (cellId !== hoveredCellRef.current) {
				hoveredCellRef.current = cellId
				setHoveredCell(cellId)
			}
		}

		document.addEventListener('pointermove', onPointerMove)
		return () => {
			document.removeEventListener('pointermove', onPointerMove)
		}
	}, [editor, shape.id])

	// Hide notes outside the focused subtree
	const { zoomedNodeId, zoomMode, state: mandalaState, frameworkId } = shape.props
	useEffect(() => {
		const { treeDefinition } = getFramework(frameworkId)
		if (!treeDefinition) return
		const root = treeDefinition.root

		// Collect all note shape IDs from mandala state
		const allNoteIds: { shapeId: string; cellId: string }[] = []
		for (const [cellId, cellState] of Object.entries(mandalaState)) {
			for (const sid of cellState.contentShapeIds ?? []) {
				allNoteIds.push({ shapeId: `shape:${sid}`, cellId })
			}
		}

		if (zoomedNodeId && zoomMode === 'focus') {
			for (const { shapeId, cellId } of allNoteIds) {
				const inSubtree = isNodeInSubtree(root, zoomedNodeId, cellId)
				const existing = editor.getShape(shapeId as any)
				if (existing) {
					editor.updateShape({
						id: existing.id,
						type: existing.type,
						opacity: inSubtree ? 1 : 0,
					})
				}
			}
		} else {
			// Restore all notes to full opacity
			for (const { shapeId } of allNoteIds) {
				const existing = editor.getShape(shapeId as any)
				if (existing && existing.opacity !== 1) {
					editor.updateShape({
						id: existing.id,
						type: existing.type,
						opacity: 1,
					})
				}
			}
		}
	}, [editor, zoomedNodeId, zoomMode, mandalaState, frameworkId])

	// Reposition notes after zoom animation completes
	const handleZoomComplete = useCallback(
		(finalArcs: Map<string, ArcAnimationState>) => {
			const mandala = editor.getShape<MandalaShape>(shape.id)
			if (!mandala) return
			repositionNotesForZoom(editor, mandala, mandala.props.zoomedNodeId ? finalArcs : null)
		},
		[editor, shape.id],
	)

	return (
		<div style={{ position: 'relative', width: shape.props.w, height: shape.props.h }}>
			<SunburstSvg
				w={shape.props.w}
				h={shape.props.h}
				frameworkId={shape.props.frameworkId}
				mandalaState={shape.props.state}
				hoveredCell={hoveredCell}
				zoomedNodeId={shape.props.zoomedNodeId}
				onZoomComplete={handleZoomComplete}
			/>
			<ZoomModeToggle shape={shape} />
		</div>
	)
}

// ─── ShapeUtil ───────────────────────────────────────────────────────────────

export class MandalaShapeUtil extends ShapeUtil<MandalaShape> {
	static override type = 'mandala' as const
	static override props: RecordProps<MandalaShape> = {
		frameworkId: T.string,
		w: T.number,
		h: T.number,
		state: T.jsonValue as any,
		arrows: T.jsonValue as any,
		arrowsVisible: T.boolean,
		zoomedNodeId: T.jsonValue as any,
		zoomMode: T.string,
	}

	getDefaultProps(): MandalaShapeProps {
		return {
			frameworkId: 'emotions-map',
			w: 800,
			h: 800,
			state: makeEmptyState(EMOTIONS_MAP),
			arrows: [],
			arrowsVisible: true,
			zoomedNodeId: null,
			zoomMode: 'navigate',
		}
	}

	getGeometry(shape: MandalaShape) {
		const r = Math.min(shape.props.w, shape.props.h) / 2
		return new Circle2d({
			x: shape.props.w / 2 - r,
			y: shape.props.h / 2 - r,
			radius: r,
			isFilled: true,
		})
	}

	component(shape: MandalaShape) {
		return <MandalaInteractive shape={shape} />
	}

	indicator(_shape: MandalaShape) {
		return null
	}

	override onClick(shape: MandalaShape) {
		// Deselect any shapes before zooming so the camera animation
		// doesn't get interpreted as a drag on selected shapes.
		this.editor.selectNone()

		setActiveMandalaId(shape.id)
		const pagePoint = this.editor.inputs.currentPagePoint
		const cellId = getLocalCellFromPage(this.editor, shape, pagePoint)

		if (cellId) {
			if (shape.props.zoomMode === 'focus') {
				// Focus zoom: update zoomedNodeId, SunburstSvg animates the arcs
				const newZoomedId = shape.props.zoomedNodeId === cellId ? null : cellId
				this.editor.updateShape<MandalaShape>({
					id: shape.id,
					type: 'mandala',
					props: { zoomedNodeId: newZoomedId },
				})
			} else {
				// Navigate zoom: camera zooms to the cell bounds (default behavior)
				const outerR = computeMandalaOuterRadius(shape.props.w, shape.props.h)
				const localCenter = { x: shape.props.w / 2, y: shape.props.h / 2 }
				const framework = getFramework(shape.props.frameworkId)
				const box = framework.treeDefinition
					? getCellBoundingBoxFromTree(framework.treeDefinition, localCenter, outerR, cellId)
					: getCellBoundingBox(framework.definition, localCenter, outerR, cellId)

				if (box) {
					const pageBox = Box.From({
						x: box.x + shape.x,
						y: box.y + shape.y,
						w: box.w,
						h: box.h,
					})

					const shrunk = Box.From({
						x: pageBox.x + pageBox.w * 0.125,
						y: pageBox.y + pageBox.h * 0.125,
						w: pageBox.w * 0.75,
						h: pageBox.h * 0.75,
					})
					this.editor.zoomToBounds(shrunk, { animation: { duration: 300 } })
				}
			}
		}

		return { id: shape.id, type: 'mandala' as const }
	}

	override onDoubleClick(shape: MandalaShape) {
		setActiveMandalaId(shape.id)
		const pagePoint = this.editor.inputs.currentPagePoint
		const cellId = getLocalCellFromPage(this.editor, shape, pagePoint)
		if (!cellId) return { id: shape.id, type: 'mandala' as const }

		const zoom = this.editor.getZoomLevel()
		const scale = getNoteScaleForZoom(zoom)
		const halfSize = 100 * scale

		const noteId = createShapeId()
		this.editor.createShape({
			id: noteId,
			type: 'note',
			x: pagePoint.x - halfSize,
			y: pagePoint.y - halfSize,
			props: { scale },
		})
		this.editor.setSelectedShapes([noteId])
		return { id: shape.id, type: 'mandala' as const }
	}

	override onResize(shape: MandalaShape, info: TLResizeInfo<MandalaShape>) {
		return resizeBox(shape, info)
	}

	override toSvg(shape: MandalaShape, _ctx: SvgExportContext) {
		return (
			<SunburstSvg
				w={shape.props.w}
				h={shape.props.h}
				frameworkId={shape.props.frameworkId}
				mandalaState={shape.props.state}
				zoomedNodeId={shape.props.zoomedNodeId}
			/>
		)
	}

	override canResize() {
		return false
	}

	override isAspectRatioLocked() {
		return true
	}

	override hideResizeHandles() {
		return true
	}

	override hideRotateHandle() {
		return true
	}
}
