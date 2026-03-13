import type { SemanticSearchPart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import { getActiveMandala } from '../lib/frameworks/active-framework'
import { getFramework } from '../lib/frameworks/framework-registry'
import { collectAnchorCells } from '../lib/prisma/cell-anchors'
import { PrismaEmbeddingService } from '../lib/prisma/embedding-service'
import { NoteVectorIndex } from '../lib/prisma/note-vector-index'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

/** Minimum similarity to include in results. */
const MIN_SIMILARITY = 0.15
/** Maximum results to return. */
const TOP_K = 5
/** Maximum query length to embed (save compute on long messages). */
const MAX_QUERY_LENGTH = 200

/** Cached index per mapId — rebuilt when state changes. */
const indexCache = new Map<string, NoteVectorIndex>()

export const SemanticSearchPartUtil = registerPromptPartUtil(
	class SemanticSearchPartUtil extends PromptPartUtil<SemanticSearchPart> {
		static override type = 'semanticSearch' as const

		override async getPart(request: AgentRequest): Promise<SemanticSearchPart> {
			const mandala = getActiveMandala(this.editor) as MandalaShape | undefined
			if (!mandala) return null as unknown as SemanticSearchPart

			const framework = getFramework(mandala.props.frameworkId)
			const treeDef = framework.treeDefinition
			if (!treeDef) return null as unknown as SemanticSearchPart

			const service = PrismaEmbeddingService.getInstance()
			if (service.status !== 'ready') return null as unknown as SemanticSearchPart

			// Extract user query from the request
			const query = request.agentMessages.join(' ').trim()
			if (!query || query.length < 3) return null as unknown as SemanticSearchPart

			try {
				// Get or create vector index for this map
				const mapId = mandala.props.frameworkId
				let index = indexCache.get(mapId)
				if (!index || index.mapId !== mapId) {
					index = new NoteVectorIndex(mapId)
					indexCache.set(mapId, index)
				}

				// Rebuild index from current state (reuses cached embeddings)
				const embedFn = (text: string) => service.embed(text)
				await index.rebuild(this.editor, mandala.props.state, embedFn)

				if (index.size === 0) return null as unknown as SemanticSearchPart

				// Embed the query and search
				const queryText = query.slice(0, MAX_QUERY_LENGTH)
				const queryEmbedding = await service.embed(queryText)
				const results = index.search(queryEmbedding, TOP_K)

				// Filter by minimum similarity
				const filtered = results.filter((r) => r.similarity >= MIN_SIMILARITY)
				if (filtered.length === 0) return null as unknown as SemanticSearchPart

				// Build label map for cell names
				const allCells = collectAnchorCells(treeDef.root)
				const labelMap = new Map<string, string>()
				for (const cell of allCells) {
					labelMap.set(cell.id, cell.label)
				}

				return {
					type: 'semanticSearch',
					query: queryText,
					results: filtered.map((r) => ({
						textSnippet: r.text.slice(0, 100),
						cellId: r.cellId,
						cellLabel: labelMap.get(r.cellId) ?? r.cellId,
						similarity: r.similarity,
					})),
				}
			} catch {
				// Semantic search is non-critical — fail silently
				return null as unknown as SemanticSearchPart
			}
		}
	},
)
