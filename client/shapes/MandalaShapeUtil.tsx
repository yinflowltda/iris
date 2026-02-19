import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
} from 'tldraw'
import type { CellStatus, MandalaState } from '../../shared/types/MandalaTypes'
import { EMOTIONS_MAP } from '../lib/frameworks/emotions-map'
import {
	computeMandalaOuterRadius,
	getCellBoundingBox,
	makeEmptyState,
} from '../lib/mandala-geometry'

const DEG_TO_RAD = Math.PI / 180

// ─── Shape type ──────────────────────────────────────────────────────────────

export type MandalaShapeProps = {
	w: number
	h: number
	state: MandalaState
}

declare module 'tldraw' {
	interface TLGlobalShapePropsMap {
		mandala: MandalaShapeProps
	}
}

export type MandalaShape = TLBaseShape<'mandala', MandalaShapeProps>

// ─── Color palette ───────────────────────────────────────────────────────────

const STROKE_COLOR = '#114559'
const TEXT_COLOR = '#114559'
const CELL_FILL_COLOR = '#FFFFFF'
const CELL_HOVER_FILL_COLOR = '#D9E2EA'
const MANDALA_LABEL_FONT = 'Quicksand, sans-serif'

const STATUS_OPACITY: Record<CellStatus, number> = {
	empty: 1.0,
	active: 1.0,
	filled: 1.0,
}

// ─── SVG path helpers ────────────────────────────────────────────────────────

function describeCellPath(
	cx: number,
	cy: number,
	innerR: number,
	outerR: number,
	startDeg: number,
	endDeg: number,
): string {
	let sweep = endDeg - startDeg
	if (sweep <= 0) sweep += 360

	const largeArc = sweep > 180 ? 1 : 0
	const startRad = startDeg * DEG_TO_RAD
	const endRad = (startDeg + sweep) * DEG_TO_RAD

	const ox1 = cx + outerR * Math.cos(startRad)
	const oy1 = cy - outerR * Math.sin(startRad)
	const ox2 = cx + outerR * Math.cos(endRad)
	const oy2 = cy - outerR * Math.sin(endRad)

	const ix1 = cx + innerR * Math.cos(endRad)
	const iy1 = cy - innerR * Math.sin(endRad)
	const ix2 = cx + innerR * Math.cos(startRad)
	const iy2 = cy - innerR * Math.sin(startRad)

	if (innerR <= 0) {
		return [
			`M ${ox1} ${oy1}`,
			`A ${outerR} ${outerR} 0 ${largeArc} 0 ${ox2} ${oy2}`,
			`L ${cx} ${cy}`,
			'Z',
		].join(' ')
	}

	return [
		`M ${ox1} ${oy1}`,
		`A ${outerR} ${outerR} 0 ${largeArc} 0 ${ox2} ${oy2}`,
		`L ${ix1} ${iy1}`,
		`A ${innerR} ${innerR} 0 ${largeArc} 1 ${ix2} ${iy2}`,
		'Z',
	].join(' ')
}

function getMidAngle(startDeg: number, endDeg: number): number {
	let sweep = endDeg - startDeg
	if (sweep <= 0) sweep += 360
	return (((startDeg + sweep / 2) % 360) + 360) % 360
}

function describeTextArc(
	cx: number,
	cy: number,
	r: number,
	startDeg: number,
	endDeg: number,
	flip: boolean,
): string {
	let sweep = endDeg - startDeg
	if (sweep <= 0) sweep += 360
	const largeArc = sweep > 180 ? 1 : 0

	const startRad = startDeg * DEG_TO_RAD
	const endRad = (startDeg + sweep) * DEG_TO_RAD

	if (flip) {
		const x1 = cx + r * Math.cos(endRad)
		const y1 = cy - r * Math.sin(endRad)
		const x2 = cx + r * Math.cos(startRad)
		const y2 = cy - r * Math.sin(startRad)
		return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
	}

	const x1 = cx + r * Math.cos(startRad)
	const y1 = cy - r * Math.sin(startRad)
	const x2 = cx + r * Math.cos(endRad)
	const y2 = cy - r * Math.sin(endRad)
	return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`
}

// ─── SVG rendering component ────────────────────────────────────────────────

const SINGLE_CLICK_DELAY_MS = 300

function MandalaSvg({
	w,
	h,
	mandalaState,
	isExport,
	onCellClick,
	onCellDoubleClick,
}: {
	w: number
	h: number
	mandalaState: MandalaState
	isExport?: boolean
	onCellClick?: (cellId: string) => void
	onCellDoubleClick?: (cellId: string, screenX: number, screenY: number) => void
}) {
	const map = EMOTIONS_MAP
	const size = Math.min(w, h)
	const labelPadding = Math.max(20, size * 0.05)
	const outerRadius = (size - labelPadding * 2) / 2
	const cx = w / 2
	const cy = h / 2
	const centerRadius = outerRadius * map.center.radiusRatio

	const sliceLabelFontSize = Math.max(10, Math.min(16, outerRadius * 0.045))
	const centerFontSize = Math.max(8, Math.min(13, centerRadius * 0.18))

	const [hoveredCell, setHoveredCell] = useState<string | null>(null)
	const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		return () => {
			if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
		}
	}, [])

	const handleCellEnter = useCallback(
		(cellId: string) => {
			if (!isExport) setHoveredCell(cellId)
		},
		[isExport],
	)

	const handleCellLeave = useCallback(() => {
		if (!isExport) setHoveredCell(null)
	}, [isExport])

	const handleDelayedClick = useCallback(
		(cellId: string) => {
			if (!onCellClick) return
			if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
			clickTimerRef.current = setTimeout(() => {
				clickTimerRef.current = null
				onCellClick(cellId)
			}, SINGLE_CLICK_DELAY_MS)
		},
		[onCellClick],
	)

	const handleDoubleClick = useCallback(
		(cellId: string, e: React.MouseEvent) => {
			if (clickTimerRef.current) {
				clearTimeout(clickTimerRef.current)
				clickTimerRef.current = null
			}
			onCellDoubleClick?.(cellId, e.clientX, e.clientY)
		},
		[onCellDoubleClick],
	)

	const sliceFlip = useMemo(() => {
		const result: Record<string, boolean> = {}
		for (const slice of map.slices) {
			const mid = getMidAngle(slice.startAngle, slice.endAngle)
			result[slice.id] = mid > 0 && mid < 180
		}
		return result
	}, [])

	// ── 1. Cell paths ─────────────────────────────────────────────────────
	const cellPaths: ReactElement[] = []
	const arcDefs: ReactElement[] = []
	const cellLabels: ReactElement[] = []

	const internalLabelOffset = Math.max(4.8, outerRadius * 0.024)

	for (const slice of map.slices) {
		const shouldFlip = sliceFlip[slice.id]

		for (const cell of slice.cells) {
			const cellState = mandalaState[cell.id]
			const isHovered = hoveredCell === cell.id
			const opacity = STATUS_OPACITY[cellState?.status ?? 'empty']

			const innerR = cell.innerRatio * outerRadius
			const outerR = cell.outerRatio * outerRadius

			const path = describeCellPath(cx, cy, innerR, outerR, slice.startAngle, slice.endAngle)

			cellPaths.push(
				// biome-ignore lint/a11y/noStaticElementInteractions: SVG path used as interactive cell in canvas
				<path
					key={cell.id}
					d={path}
					fill={isHovered ? CELL_HOVER_FILL_COLOR : CELL_FILL_COLOR}
					fillOpacity={opacity}
					stroke={STROKE_COLOR}
					strokeWidth={1}
					onPointerEnter={(e) => {
						e.stopPropagation()
						handleCellEnter(cell.id)
					}}
					onPointerLeave={(e) => {
						e.stopPropagation()
						handleCellLeave()
					}}
					onPointerDown={(e) => e.stopPropagation()}
					onClick={() => handleDelayedClick(cell.id)}
					onDoubleClick={(e) => handleDoubleClick(cell.id, e)}
					style={{ cursor: 'pointer', pointerEvents: 'all', transition: 'fill 0.15s ease' }}
				/>,
			)

			const maxSafeOffset = Math.max(2, outerR - innerR - 2)
			const labelR = outerR - Math.min(internalLabelOffset, maxSafeOffset)
			const pathId = `arc-${cell.id}`
			arcDefs.push(
				<path
					key={pathId}
					id={pathId}
					d={describeTextArc(cx, cy, labelR, slice.startAngle, slice.endAngle, shouldFlip)}
					fill="none"
					stroke="none"
				/>,
			)

			const cellFontSize = Math.max(4.93, Math.min(8.45, (outerR - innerR) * 0.155))
			cellLabels.push(
				<text
					key={`label-${cell.id}`}
					fontSize={cellFontSize}
					fill={TEXT_COLOR}
					pointerEvents="none"
					style={{ userSelect: 'none', fontFamily: MANDALA_LABEL_FONT }}
				>
					<textPath
						href={`#${pathId}`}
						startOffset="50%"
						textAnchor="middle"
						dominantBaseline="central"
					>
						{cell.label}
					</textPath>
				</text>,
			)
		}
	}

	// ── 2. Slice divider lines ────────────────────────────────────────────
	const sliceLines: ReactElement[] = map.slices.map((slice) => {
		const rad = slice.startAngle * DEG_TO_RAD
		const x1 = cx + centerRadius * Math.cos(rad)
		const y1 = cy - centerRadius * Math.sin(rad)
		const x2 = cx + outerRadius * Math.cos(rad)
		const y2 = cy - outerRadius * Math.sin(rad)
		return (
			<line
				key={`slice-line-${slice.id}`}
				x1={x1}
				y1={y1}
				x2={x2}
				y2={y2}
				stroke={STROKE_COLOR}
				strokeWidth={1.5}
				pointerEvents="none"
			/>
		)
	})

	// ── 3. Ring boundary circles ──────────────────────────────────────────
	const ringBoundaries = new Set<number>()
	for (const slice of map.slices) {
		for (const cell of slice.cells) {
			ringBoundaries.add(cell.innerRatio)
			ringBoundaries.add(cell.outerRatio)
		}
	}
	const ringCircles: ReactElement[] = [...ringBoundaries].map((ratio) => (
		<circle
			key={`ring-${ratio}`}
			cx={cx}
			cy={cy}
			r={ratio * outerRadius}
			fill="none"
			stroke={STROKE_COLOR}
			strokeWidth={0.75}
			pointerEvents="none"
		/>
	))

	// ── 4. Center circle ─────────────────────────────────────────────────
	const isCenterHovered = hoveredCell === map.center.id
	const centerCircle = (
		<g key="center">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: SVG circle used as interactive cell in canvas */}
			<circle
				cx={cx}
				cy={cy}
				r={centerRadius}
				fill={isCenterHovered ? CELL_HOVER_FILL_COLOR : 'white'}
				stroke={STROKE_COLOR}
				strokeWidth={1.5}
				onPointerEnter={(e) => {
					e.stopPropagation()
					handleCellEnter(map.center.id)
				}}
				onPointerLeave={(e) => {
					e.stopPropagation()
					handleCellLeave()
				}}
				onPointerDown={(e) => e.stopPropagation()}
				onClick={() => handleDelayedClick(map.center.id)}
				onDoubleClick={(e) => handleDoubleClick(map.center.id, e)}
				style={{ cursor: 'pointer', pointerEvents: 'all', transition: 'fill 0.15s ease' }}
			/>
			<text
				x={cx}
				y={cy}
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={centerFontSize}
				fontWeight="bold"
				fill="#999"
				pointerEvents="none"
				style={{ userSelect: 'none', fontFamily: MANDALA_LABEL_FONT }}
			>
				{map.center.label}
			</text>
		</g>
	)

	// ── 5. Outer slice labels (via textPath) ─────────────────────────────
	const sliceLabelR = outerRadius + labelPadding * 0.45
	const sliceLabelDefs: ReactElement[] = []
	const sliceLabelTexts: ReactElement[] = []

	for (const slice of map.slices) {
		const shouldFlip = sliceFlip[slice.id]
		const pathId = `slice-arc-${slice.id}`

		sliceLabelDefs.push(
			<path
				key={pathId}
				id={pathId}
				d={describeTextArc(cx, cy, sliceLabelR, slice.startAngle, slice.endAngle, shouldFlip)}
				fill="none"
				stroke="none"
			/>,
		)

		sliceLabelTexts.push(
			<text
				key={`slabel-${slice.id}`}
				fontSize={sliceLabelFontSize}
				fontWeight="bold"
				fill={STROKE_COLOR}
				pointerEvents="none"
				style={{
					userSelect: 'none',
					fontFamily: MANDALA_LABEL_FONT,
					textTransform: 'uppercase',
					letterSpacing: '0.08em',
				}}
			>
				<textPath
					href={`#${pathId}`}
					startOffset="50%"
					textAnchor="middle"
					dominantBaseline="central"
				>
					{slice.label}
				</textPath>
			</text>,
		)
	}

	// ── 6. Outer boundary circle ─────────────────────────────────────────
	const outerCircle = (
		<circle
			key="outer-boundary"
			cx={cx}
			cy={cy}
			r={outerRadius}
			fill="none"
			stroke={STROKE_COLOR}
			strokeWidth={1.5}
			pointerEvents="none"
		/>
	)

	return (
		<svg
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="Emotions Map Mandala"
		>
			<defs>
				{arcDefs}
				{sliceLabelDefs}
			</defs>
			<g>{cellPaths}</g>
			<g>{ringCircles}</g>
			{outerCircle}
			<g>{sliceLines}</g>
			{centerCircle}
			<g>{cellLabels}</g>
			<g>{sliceLabelTexts}</g>
		</svg>
	)
}

// ─── Interactive wrapper (needs useEditor) ───────────────────────────────────

const NOTE_HALF_SIZE = 100

function MandalaInteractive({ shape }: { shape: MandalaShape }) {
	const editor = useEditor()

	const handleCellClick = useCallback(
		(cellId: string) => {
			const mandala = editor.getShape<MandalaShape>(shape.id)
			if (!mandala) return

			const outerR = computeMandalaOuterRadius(mandala.props.w, mandala.props.h)
			const localCenter = { x: mandala.props.w / 2, y: mandala.props.h / 2 }
			const box = getCellBoundingBox(EMOTIONS_MAP, localCenter, outerR, cellId)
			if (!box) return

			const pageBox = Box.From({
				x: box.x + mandala.x,
				y: box.y + mandala.y,
				w: box.w,
				h: box.h,
			})

			editor.zoomToBounds(pageBox.expandBy(50), { animation: { duration: 300 } })
		},
		[editor, shape.id],
	)

	const handleCellDoubleClick = useCallback(
		(_cellId: string, screenX: number, screenY: number) => {
			const viewport = editor.getViewportScreenBounds()
			const camera = editor.getCamera()
			const pageX = (screenX - viewport.x) / camera.z - camera.x
			const pageY = (screenY - viewport.y) / camera.z - camera.y

			const noteId = createShapeId()
			editor.createShape({
				id: noteId,
				type: 'note',
				x: pageX - NOTE_HALF_SIZE,
				y: pageY - NOTE_HALF_SIZE,
			})
			editor.setSelectedShapes([noteId])
			editor.setEditingShape(noteId)
		},
		[editor],
	)

	return (
		<MandalaSvg
			w={shape.props.w}
			h={shape.props.h}
			mandalaState={shape.props.state}
			onCellClick={handleCellClick}
			onCellDoubleClick={handleCellDoubleClick}
		/>
	)
}

// ─── ShapeUtil ───────────────────────────────────────────────────────────────

export class MandalaShapeUtil extends ShapeUtil<MandalaShape> {
	static override type = 'mandala' as const
	static override props: RecordProps<MandalaShape> = {
		w: T.number,
		h: T.number,
		state: T.jsonValue as any,
	}

	getDefaultProps(): MandalaShapeProps {
		return {
			w: 800,
			h: 800,
			state: makeEmptyState(EMOTIONS_MAP),
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

	override onResize(shape: MandalaShape, info: TLResizeInfo<MandalaShape>) {
		return resizeBox(shape, info)
	}

	override toSvg(shape: MandalaShape, _ctx: SvgExportContext) {
		return (
			<MandalaSvg
				w={shape.props.w}
				h={shape.props.h}
				mandalaState={shape.props.state}
				isExport={true}
			/>
		)
	}

	override canResize() {
		return false
	}

	override isAspectRatioLocked() {
		return true
	}

	override hideSelectionBoundsBg() {
		return true
	}

	override hideSelectionBoundsFg() {
		return true
	}

	override hideResizeHandles() {
		return true
	}

	override hideRotateHandle() {
		return true
	}
}
