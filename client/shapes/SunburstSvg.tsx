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
	const globalLabelScale = 0.65
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

	// Pre-compute week-slot IDs so we can distinguish month cells (rendered in Loop 3)
	// from other hideLabel cells (day segments — should render as cells without labels)
	const weekMergedArcs = mergedArcs.filter((a) => a.groupId && a.memberIds.length > 1)
	const weekSlotIdSet = new Set(weekMergedArcs.flatMap((a) => a.memberIds))

	const cellPaths: ReactElement[] = []
	const arcDefs: ReactElement[] = []
	const cellLabels: ReactElement[] = []

	// ── Transparent group labels (from raw arcs) ─────────────────────
	for (const arc of arcs) {
		if (!arc.transparent) continue
		if (arc.hideLabel) continue
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

		const fontSize = Math.max(7, Math.min(12, outerRadius * 0.03)) * globalLabelScale
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
		// Skip root and transparent cells
		if (rootArc && mArc.id === rootArc.id) continue
		if (mArc.transparent) continue
		// Skip month cells (hideLabel + child of week-slot) — they're rendered in Loop 3
		// Other hideLabel cells (day segments) render as cells without labels
		if (mArc.hideLabel && mArc.parentId != null && weekSlotIdSet.has(mArc.parentId)) continue

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
		if (sweep < 0.15 || mArc.hideLabel || !showLabelForArc(mArc.memberIds[0])) continue

		const innerR = mArc.y0 * outerRadius
		const outerR = mArc.y1 * outerRadius
		// Cap offset at ~15% of a typical single band so labels in tall cells
		// (e.g., Flow spanning 4 bands) align with labels in normal single-band cells
		const maxOffset = outerRadius * 0.15 * 0.15
		const offset = Math.max(4.8, Math.min((outerR - innerR) * 0.15, maxOffset))
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

		// Cap font size by both radial band height and arc length
		const arcLen = ((mArc.x1 - mArc.x0) * (innerR + outerR)) / 2
		const charWidth = 0.55 // approximate char width as fraction of font size
		const maxFontByArc = (arcLen / Math.max(mArc.label.length, 1)) / charWidth
		const baseFontSize = Math.max(4.5, Math.min(8.45, (outerR - innerR) * 0.155, maxFontByArc))
		const fontSize = baseFontSize * globalLabelScale * (mArc.labelScale ?? 1)
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

	// ── Month cells + labels: compute from merged week arcs ──────────────
	// Each merged week arc spans 3 months, each getting 1/3 of the week's angular width
	// Rendered as single arcs (no per-day subdivision)
	{
		const weekArcs = weekMergedArcs
		// Get a sample month arc for y band — must be a child of a week-slot, not just any hideLabel arc
		const sampleMonth = effectiveArcs.find((a) => a.hideLabel && a.parentId != null && weekSlotIdSet.has(a.parentId))
		if (sampleMonth && weekArcs.length > 0) {
			const monthY0 = sampleMonth.y0
			const monthY1 = sampleMonth.y1
			const innerR = monthY0 * outerRadius
			const outerR = monthY1 * outerRadius

			for (const weekArc of weekArcs) {
				const firstMemberId = weekArc.memberIds[0]

				// Find month children of this week-slot
				const monthArcs = effectiveArcs.filter((a) => a.parentId === firstMemberId && a.hideLabel)
				if (monthArcs.length === 0) continue

				const monthsPerWeek = monthArcs.length // 3
				const weekSweep = weekArc.x1 - weekArc.x0
				const monthSweep = weekSweep / monthsPerWeek

				// Sort months by angle to get correct order
				monthArcs.sort((a, b) => a.x0 - b.x0)

				for (let m = 0; m < monthsPerWeek; m++) {
					const monthX0 = weekArc.x0 + m * monthSweep
					const monthX1 = monthX0 + monthSweep

					// ── Cell path (single merged month arc) ─────────────
					const monthCellArc = { x0: monthX0, x1: monthX1, y0: monthY0, y1: monthY1, id: monthArcs[m].id, label: monthArcs[m].label, depth: monthArcs[m].depth, transparent: false, parentId: null, hasChildren: false }
					const pathD = arcGen(monthCellArc)
					if (pathD) {
						const isHovered = hoveredCell === monthArcs[m].id
						cellPaths.push(
							<path
								key={`month-cell-${weekArc.id}-${m}`}
								d={pathD}
								fill={isHovered ? colors.cellHoverFill : colors.cellFill}
								stroke={colors.stroke}
								strokeWidth={1}
								style={{ transition: 'fill 0.15s ease' }}
							/>,
						)
					}

					// ── Label ───────────────────────────────────────────
					const labelOffset = Math.max(4.8, (outerR - innerR) * 0.15)
					const labelR = outerR - labelOffset
					const midAngle = (monthX0 + monthX1) / 2
					const shouldFlip = midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2

					const pathId = `sb-month-${weekArc.id}-${m}`
					const textArcD = describeTextArcRadians(cx, cy, labelR, monthX0, monthX1, shouldFlip)
					arcDefs.push(<path key={pathId} id={pathId} d={textArcD} fill="none" stroke="none" />)

					const arcLen = (monthSweep * (innerR + outerR)) / 2
					const charW = 0.55
					const maxFontByArc = (arcLen / Math.max(monthArcs[m].label.length, 1)) / charW
					const fontSize = Math.max(4.5, Math.min(8.45, (outerR - innerR) * 0.155, maxFontByArc)) * globalLabelScale
					cellLabels.push(
						<text
							key={`month-label-${weekArc.id}-${m}`}
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
								{monthArcs[m].label}
							</textPath>
						</text>,
					)
				}
			}
		}
	}

	// ── Overlay ring (e.g., life phase blocks) ──────────────────────────
	if (treeDef.overlayRing) {
		const overlay = treeDef.overlayRing
		const startArc = effectiveArcs.find((a) => a.id === overlay.startNodeId)
		const endArc = effectiveArcs.find((a) => a.id === overlay.endNodeId)
		if (startArc && endArc) {
			const regionX0 = startArc.x0
			const regionX1 = endArc.x1
			// Handle wrapping around 2π
			const regionSweep =
				regionX1 >= regionX0 ? regionX1 - regionX0 : regionX1 + 2 * Math.PI - regionX0

			// Find the y band: use the outermost ring that has content in other halves
			// (one band beyond the deepest leaf in the overlay region)
			const leafArcs = effectiveArcs.filter((a) => !a.hasChildren && !a.transparent)
			const regionLeaves = leafArcs.filter((a) => {
				// Check if arc is in the overlay region (handles wrapping)
				if (regionX0 <= regionX1) return a.x0 >= regionX0 && a.x1 <= regionX1
				return a.x0 >= regionX0 || a.x1 <= regionX1
			})
			const nonRegionLeaves = leafArcs.filter((a) => {
				if (regionX0 <= regionX1) return a.x0 < regionX0 || a.x1 > regionX1
				return a.x0 < regionX0 && a.x1 > regionX1
			})
			const regionMaxY = regionLeaves.length > 0 ? Math.max(...regionLeaves.map((a) => a.y1)) : 0.667
			const outerMaxY = nonRegionLeaves.length > 0 ? Math.max(...nonRegionLeaves.map((a) => a.y1)) : 0.833
			const overlayY0 = regionMaxY
			const overlayY1 = outerMaxY

			let cursor = regionX0
			for (const oArc of overlay.arcs) {
				const arcSweep = oArc.fraction * regionSweep
				const arcX0 = cursor
				const arcX1 = cursor + arcSweep
				cursor = arcX1

				const pathD = arcGen({
					x0: arcX0, x1: arcX1, y0: overlayY0, y1: overlayY1,
					id: oArc.id, label: oArc.label, depth: 0, transparent: false,
					parentId: null, hasChildren: false,
				})
				if (!pathD) continue

				const isHovered = hoveredCell === oArc.id
				cellPaths.push(
					<path
						key={`overlay-${oArc.id}`}
						d={pathD}
						fill={isHovered ? colors.cellHoverFill : colors.cellFill}
						stroke={colors.stroke}
						strokeWidth={1}
						style={{ transition: 'fill 0.15s ease' }}
					/>,
				)

				// Label
				if (arcSweep >= 0.08) {
					const innerR = overlayY0 * outerRadius
					const outerR = overlayY1 * outerRadius
					const labelOffset = Math.max(4.8, (outerR - innerR) * 0.15)
					const labelR = outerR - labelOffset
					const midAngle = (arcX0 + arcX1) / 2
					const shouldFlip = midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2
					const pathId = `sb-overlay-${oArc.id}`
					const textArcD = describeTextArcRadians(cx, cy, labelR, arcX0, arcX1, shouldFlip)
					arcDefs.push(<path key={pathId} id={pathId} d={textArcD} fill="none" stroke="none" />)

					const arcLen = (arcSweep * (innerR + outerR)) / 2
					const charW = 0.55
					const maxFontByArc = (arcLen / Math.max(oArc.label.length, 1)) / charW
					const fontSize = Math.max(4.5, Math.min(8.45, (outerR - innerR) * 0.155, maxFontByArc)) * globalLabelScale
					cellLabels.push(
						<text
							key={`overlay-label-${oArc.id}`}
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
								{oArc.label}
							</textPath>
						</text>,
					)
				}
			}
		}
	}

	// ── Center circle ────────────────────────────────────────────────────
	const isCenterHovered = rootArc && hoveredCell === rootArc.id
	const animatedRoot = rootArc ? animatingArcs?.get(rootArc.id) : undefined
	const centerRadius = rootArc
		? (animatedRoot?.y1 ?? rootArc.y1) * outerRadius
		: outerRadius * 0.15
	const centerLabel = rootArc?.label ?? treeDef.root.label
	const centerFontSize = Math.max(10, Math.min(16, outerRadius * 0.045)) * globalLabelScale

	// Hide root label when zoomed to a non-root cell
	const showRootLabel = false

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
				y={cy - outerRadius - labelPadding * 0.5}
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
