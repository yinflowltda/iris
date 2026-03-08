import { arc as d3Arc } from 'd3-shape'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import { getFramework } from '../lib/frameworks/framework-registry'
import type { MergedArc } from '../lib/sunburst-groups'
import { mergeGroupArcs } from '../lib/sunburst-groups'
import type { SunburstArc } from '../lib/sunburst-layout'
import { computeSunburstLayout, isNodeInSubtree } from '../lib/sunburst-layout'
import type { ArcAnimationState } from '../lib/sunburst-zoom'
import { animateSunburstZoom, computeZoomTargets } from '../lib/sunburst-zoom'

// ─── Props ───────────────────────────────────────────────────────────────────

interface SunburstSvgProps {
	w: number
	h: number
	frameworkId: string
	mandalaState: MandalaState
	hoveredCell?: string | null
	zoomedNodeId?: string | null
	animatingArcs?: Map<string, { x0: number; x1: number; y0: number; y1: number }>
	onZoomComplete?: (finalArcs: Map<string, ArcAnimationState>) => void
	coverContent?: React.ReactNode
	onTitlePointerDown?: (e: React.PointerEvent) => void
}

const ZOOM_ANIMATION_MS = 400

// ─── Component ───────────────────────────────────────────────────────────────

export function SunburstSvg({
	w,
	h,
	frameworkId,
	mandalaState: _mandalaState,
	hoveredCell,
	zoomedNodeId,
	animatingArcs: animatingArcsProp,
	onZoomComplete,
	coverContent,
	onTitlePointerDown,
}: SunburstSvgProps) {
	const framework = getFramework(frameworkId)
	const treeDef = framework.treeDefinition
	const { colors, labelFont } = framework.visual

	const arcs = useMemo(() => {
		if (!treeDef) return []
		return computeSunburstLayout(treeDef)
	}, [treeDef])

	// ── Zoom animation state ─────────────────────────────────────────────
	const animatingArcsRef = useRef<Map<string, ArcAnimationState> | null>(null)
	const [, setAnimFrame] = useState(0)
	const cancelRef = useRef<(() => void) | null>(null)

	useEffect(() => {
		if (arcs.length === 0) return

		// Cancel any running animation
		cancelRef.current?.()
		cancelRef.current = null

		// Build current state from ref or from base layout
		const current = new Map<string, ArcAnimationState>()
		for (const arc of arcs) {
			const existing = animatingArcsRef.current?.get(arc.id)
			current.set(arc.id, existing ?? { x0: arc.x0, x1: arc.x1, y0: arc.y0, y1: arc.y1 })
		}

		// Compute target: if zoomedNodeId is set, zoom to it; otherwise reset to base layout
		let target: Map<string, ArcAnimationState>
		if (zoomedNodeId) {
			target = computeZoomTargets(arcs, zoomedNodeId)
			if (target.size === 0) return // unknown node, do nothing
		} else {
			target = new Map<string, ArcAnimationState>()
			for (const arc of arcs) {
				target.set(arc.id, { x0: arc.x0, x1: arc.x1, y0: arc.y0, y1: arc.y1 })
			}
		}

		const cancel = animateSunburstZoom({
			current,
			target,
			durationMs: ZOOM_ANIMATION_MS,
			onFrame: (interpolated) => {
				animatingArcsRef.current = interpolated
				setAnimFrame((n) => n + 1)
			},
			onComplete: () => {
				// Keep final state in ref so next animation starts from here
				cancelRef.current = null
				onZoomComplete?.(target)
			},
		})

		cancelRef.current = cancel
		return () => {
			cancel()
		}
	}, [zoomedNodeId, arcs, onZoomComplete])

	// Use animation ref if active, then prop override, then nothing
	const animatingArcs = animatingArcsRef.current ?? animatingArcsProp

	if (!treeDef || arcs.length === 0) return null

	const size = Math.min(w, h)
	const labelPadding = Math.max(20, size * 0.05)
	const outerRadius = (size - labelPadding * 2) / 2
	const cx = w / 2
	const cy = h / 2

	// Configure d3 arc generator
	const arcGen = d3Arc<SunburstArc>()
		.startAngle((d) => d.x0)
		.endAngle((d) => d.x1)
		.innerRadius((d) => d.y0 * outerRadius)
		.outerRadius((d) => d.y1 * outerRadius)

	// Find root node
	const rootArc = arcs.find((a) => a.depth === 0)

	// When zoomed to a non-root cell, only show labels for the zoomed subtree
	const isZoomedNonRoot = zoomedNodeId && rootArc && zoomedNodeId !== rootArc.id
	const showLabelForArc = (arcId: string) => {
		if (!isZoomedNonRoot) return true
		return isNodeInSubtree(treeDef.root, zoomedNodeId!, arcId)
	}

	// ── Compute merged arcs for grouped rendering ──────────────────────
	// Apply animation to base arcs, then merge groups for visual rendering
	const effectiveArcs: SunburstArc[] = arcs.map((arc) =>
		animatingArcs?.has(arc.id) ? { ...arc, ...animatingArcs.get(arc.id)! } : arc,
	)
	const mergedArcs: MergedArc[] = mergeGroupArcs(effectiveArcs)

	const cellPaths: ReactElement[] = []
	const arcDefs: ReactElement[] = []
	const cellLabels: ReactElement[] = []

	// ── Transparent group labels (from raw arcs) ─────────────────────
	for (const arc of arcs) {
		if (!arc.transparent) continue
		if (rootArc && arc.id === rootArc.id) continue

		const effectiveArc = animatingArcs?.has(arc.id)
			? { ...arc, ...animatingArcs.get(arc.id)! }
			: arc

		const sweep = effectiveArc.x1 - effectiveArc.x0
		if (sweep < 0.15 || !showLabelForArc(arc.id)) continue

		// Place label on the outermost edge of all descendants' rings
		const descendantIds = new Set<string>()
		function collectDescendants(parentId: string) {
			for (const a of arcs) {
				if (a.parentId === parentId && !descendantIds.has(a.id)) {
					descendantIds.add(a.id)
					collectDescendants(a.id)
				}
			}
		}
		collectDescendants(arc.id)
		let maxChildY1 = effectiveArc.y1
		for (const descId of descendantIds) {
			const descArc = arcs.find((a) => a.id === descId)
			if (!descArc) continue
			const descEffective = animatingArcs?.has(descId)
				? { ...descArc, ...animatingArcs.get(descId)! }
				: descArc
			if (descEffective.y1 > maxChildY1) maxChildY1 = descEffective.y1
		}
		const labelR = maxChildY1 * outerRadius + 6

		const midAngle = (effectiveArc.x0 + effectiveArc.x1) / 2
		const shouldFlip = midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2

		const pathId = `sb-arc-${arc.id}`
		const textArcD = describeTextArcRadians(
			cx,
			cy,
			labelR,
			effectiveArc.x0,
			effectiveArc.x1,
			shouldFlip,
		)

		arcDefs.push(<path key={pathId} id={pathId} d={textArcD} fill="none" stroke="none" />)

		const fontSize = Math.max(7, Math.min(12, outerRadius * 0.03))
		cellLabels.push(
			<text
				key={`label-${arc.id}`}
				fontSize={fontSize}
				fill={colors.text}
				fillOpacity={0.5}
				pointerEvents="none"
				style={{
					userSelect: 'none',
					fontFamily: labelFont,
					textTransform: 'uppercase',
					letterSpacing: '0.15em',
				}}
			>
				<textPath
					href={`#${pathId}`}
					startOffset="50%"
					textAnchor="middle"
					dominantBaseline="central"
				>
					{arc.label}
				</textPath>
			</text>,
		)
	}

	// ── Visible cell arcs (from merged arcs) ─────────────────────────
	for (const mArc of mergedArcs) {
		// Skip root and transparent
		if (rootArc && mArc.id === rootArc.id) continue
		if (mArc.transparent) continue

		const isHovered = hoveredCell
			? mArc.memberIds.includes(hoveredCell) || hoveredCell === mArc.id
			: false
		const pathD = arcGen(mArc)
		if (!pathD) continue

		// ── Cell path ────────────────────────────────────────────────
		cellPaths.push(
			<path
				key={mArc.id}
				d={pathD}
				fill={isHovered ? colors.cellHoverFill : colors.cellFill}
				stroke={colors.stroke}
				strokeWidth={1}
				style={{ transition: 'fill 0.15s ease' }}
			/>,
		)

		// ── Label arc + text ─────────────────────────────────────────
		const sweep = mArc.x1 - mArc.x0
		if (sweep < 0.15 || !showLabelForArc(mArc.memberIds[0])) continue

		const innerR = mArc.y0 * outerRadius
		const outerR = mArc.y1 * outerRadius
		const offset = Math.max(4.8, (outerR - innerR) * 0.15)
		const labelR = outerR - offset

		const midAngle = (mArc.x0 + mArc.x1) / 2
		const shouldFlip = midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2

		const pathId = `sb-arc-${mArc.id}`
		const textArcD = describeTextArcRadians(
			cx,
			cy,
			labelR,
			mArc.x0,
			mArc.x1,
			shouldFlip,
		)

		arcDefs.push(<path key={pathId} id={pathId} d={textArcD} fill="none" stroke="none" />)

		const fontSize = Math.max(4.93, Math.min(8.45, (outerR - innerR) * 0.155))
		cellLabels.push(
			<text
				key={`label-${mArc.id}`}
				fontSize={fontSize}
				fill={colors.text}
				pointerEvents="none"
				style={{ userSelect: 'none', fontFamily: labelFont }}
			>
				<textPath
					href={`#${pathId}`}
					startOffset="50%"
					textAnchor="middle"
					dominantBaseline="central"
				>
					{mArc.label}
				</textPath>
			</text>,
		)
	}

	// ── Center circle ────────────────────────────────────────────────────
	const isCenterHovered = rootArc && hoveredCell === rootArc.id
	const animatedRoot = rootArc ? animatingArcs?.get(rootArc.id) : undefined
	const centerRadius = rootArc
		? (animatedRoot?.y1 ?? rootArc.y1) * outerRadius
		: outerRadius * 0.15
	const centerLabel = rootArc?.label ?? treeDef.root.label
	const centerFontSize = Math.max(10, Math.min(16, outerRadius * 0.045))

	// Hide root label when zoomed to a non-root cell
	const showRootLabel = !isZoomedNonRoot

	const centerCircle = (
		<g key="center">
			<circle
				cx={cx}
				cy={cy}
				r={centerRadius}
				fill={isCenterHovered ? colors.cellHoverFill : 'white'}
				stroke={colors.stroke}
				strokeWidth={1.5}
				style={{ transition: 'fill 0.15s ease' }}
			/>
			{showRootLabel && <text
				x={cx}
				y={cy}
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={centerFontSize}
				fontWeight="bold"
				fill="#808080"
				fillOpacity={0.7}
				pointerEvents="none"
				style={{
					userSelect: 'none',
					fontFamily: labelFont,
					textTransform: 'uppercase',
				}}
			>
				{centerLabel.toUpperCase()}
			</text>}
		</g>
	)

	return (
		<svg
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label={`${treeDef.name} Mandala`}
		>
			<defs>{arcDefs}</defs>
			<g transform={`translate(${cx},${cy})`}>{cellPaths}</g>
			{centerCircle}
			<g>{cellLabels}</g>
			{coverContent && (
				<>
					<clipPath id="mandala-cover-clip">
						<circle cx={cx} cy={cy} r={outerRadius} />
					</clipPath>
					<foreignObject
						x={cx - outerRadius}
						y={cy - outerRadius}
						width={outerRadius * 2}
						height={outerRadius * 2}
						clipPath="url(#mandala-cover-clip)"
					>
						{coverContent}
					</foreignObject>
				</>
			)}
			<text
				x={cx}
				y={cy - outerRadius - labelPadding * 0.5 + 50}
				textAnchor="middle"
				dominantBaseline="auto"
				fontSize={18}
				fontWeight={400}
				fontFamily="Quicksand, sans-serif"
				fill={colors.text}
				pointerEvents={onTitlePointerDown ? 'all' : 'none'}
				onPointerDown={onTitlePointerDown}
				style={{ userSelect: 'none', cursor: onTitlePointerDown ? 'grab' : undefined }}
			>
				{treeDef.name}
			</text>
		</svg>
	)
}

// ─── Text arc helper (radians, SVG coordinate space) ─────────────────────────
//
// d3 sunburst uses radians with 0 at 12-o'clock going clockwise.
// SVG arcs use standard math angles. We convert here.
//
// In d3 partition layout, angles are measured from 12-o'clock (top) going
// clockwise. In SVG, we need to convert: SVG angle = d3 angle - PI/2
// (rotate -90 degrees to align 0 at top).

function describeTextArcRadians(
	cx: number,
	cy: number,
	r: number,
	startAngle: number,
	endAngle: number,
	flip: boolean,
): string {
	// Convert from d3 convention (0=top, clockwise) to SVG convention
	// In SVG, we compute x = cx + r*sin(angle), y = cy - r*cos(angle)
	// for the d3 convention where 0 is at top going clockwise.

	// Cap sweep just below 2π so start/end points stay distinct
	// (a full-circle arc degenerates in SVG because endpoints coincide)
	const maxSweep = 2 * Math.PI - 0.001
	const clampedEnd = startAngle + Math.min(endAngle - startAngle, maxSweep)

	const x1 = cx + r * Math.sin(startAngle)
	const y1 = cy - r * Math.cos(startAngle)
	const x2 = cx + r * Math.sin(clampedEnd)
	const y2 = cy - r * Math.cos(clampedEnd)

	const sweep = clampedEnd - startAngle
	const largeArc = sweep > Math.PI ? 1 : 0

	if (flip) {
		// Draw arc in reverse direction so text reads correctly
		return `M ${x2} ${y2} A ${r} ${r} 0 ${largeArc} 0 ${x1} ${y1}`
	}

	// Normal clockwise arc
	return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}
