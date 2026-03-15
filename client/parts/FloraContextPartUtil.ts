import type { FloraContextPart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import { getActiveMandala } from '../lib/frameworks/active-framework'
import { getFramework } from '../lib/frameworks/framework-registry'
import { collectAnchorCells } from '../lib/flora/cell-anchors'
import { FloraEmbeddingService } from '../lib/flora/embedding-service'
import { classifyNoteBatch } from '../lib/flora/note-classifier'
import { analyzeKnowledgeGraph } from '../lib/flora/symbolic-reasoning'
import { extractNoteDescriptors } from '../lib/flora/use-note-classifier'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const FloraContextPartUtil = registerPromptPartUtil(
	class FloraContextPartUtil extends PromptPartUtil<FloraContextPart> {
		static override type = 'floraContext' as const

		override async getPart(_request: AgentRequest): Promise<FloraContextPart> {
			const mandala = getActiveMandala(this.editor) as MandalaShape | undefined
			if (!mandala) return null as unknown as FloraContextPart

			const framework = getFramework(mandala.props.frameworkId)
			const treeDef = framework.treeDefinition
			if (!treeDef) return null as unknown as FloraContextPart

			const service = FloraEmbeddingService.getInstance()
			if (service.status === 'idle') {
				// Kick off init for next request, skip this one
				service.init().catch(() => {})
				return null as unknown as FloraContextPart
			}
			if (service.status !== 'ready') return null as unknown as FloraContextPart

			const state = mandala.props.state
			const descriptors = extractNoteDescriptors(this.editor, state)
			if (descriptors.length === 0) return null as unknown as FloraContextPart

			try {
				const embedFn = (text: string) => service.embed(text)
				const result = await classifyNoteBatch(descriptors, state, treeDef, embedFn)

				// Build label map for cell names
				const allCells = collectAnchorCells(treeDef.root)
				const labelMap = new Map<string, string>()
				for (const cell of allCells) {
					labelMap.set(cell.id, cell.label)
				}

				// Build note classifications
				const noteClassifications: FloraContextPart['noteClassifications'] = result.entries.map(
					(entry) => ({
						textSnippet: entry.text.slice(0, 80),
						currentCellId: entry.currentCellId,
						currentCellLabel: entry.currentCellId
							? (labelMap.get(entry.currentCellId) ?? entry.currentCellId)
							: null,
						bestMatchCellId: entry.matches[0]?.cellId ?? null,
						bestMatchCellLabel: entry.matches[0]?.label ?? null,
						similarity: entry.matches[0]?.similarity ?? 0,
						isMisplaced:
							entry.currentCellId !== null &&
							entry.matches.length > 0 &&
							entry.currentCellId !== entry.matches[0].cellId,
					}),
				)

				// Build cell coverage
				const allCellIds = allCells.map((c) => c.id)
				const filledCellIds = new Set<string>()
				for (const [cellId, cellState] of Object.entries(state)) {
					if (cellState.contentShapeIds.length > 0) {
						filledCellIds.add(cellId)
					}
				}

				const emptyCells = allCellIds
					.filter((id) => !filledCellIds.has(id))
					.map((id) => ({
						cellId: id,
						cellLabel: labelMap.get(id) ?? id,
					}))

				// Knowledge graph analysis (chains, gaps, coverage)
				const arrows = mandala.props.arrows ?? []
				const graphResult = analyzeKnowledgeGraph(arrows, state, treeDef)
				const graphAnalysis: FloraContextPart['graphAnalysis'] =
					(treeDef.edgeTypes?.length ?? 0) > 0
						? {
								chains: graphResult.chains.map((c) => ({
									edgeTypeIds: c.edgeTypeIds,
									cellIds: c.cellIds,
									isComplete: c.isComplete,
								})),
								gaps: graphResult.gaps.map((g) => ({
									edgeLabel: g.edgeLabel,
									fromCellLabel: g.fromCellLabel,
									toCellLabel: g.toCellLabel,
									suggestWhen: g.suggestWhen,
								})),
								thinCells: graphResult.coverage.thinCells.map((c) => ({
									cellLabel: c.label,
									noteCount: c.noteCount,
								})),
								stats: graphResult.stats,
							}
						: undefined

				return {
					type: 'floraContext',
					noteClassifications,
					emptyCells,
					totalNotes: descriptors.length,
					totalCells: allCellIds.length,
					filledCellCount: filledCellIds.size,
					graphAnalysis,
				}
			} catch {
				// Flora context is non-critical — fail silently
				return null as unknown as FloraContextPart
			}
		}
	},
)
