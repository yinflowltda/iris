import { useCallback } from 'react'
import {
	Circle2d,
	Group2d,
	getColorValue,
	getDefaultColorTheme,
	LABEL_FONT_SIZES,
	NoteShapeUtil,
	RichTextLabel,
	TEXT_PROPS,
	type TLNoteShape,
	type TLShapeId,
	useEditor,
	useValue,
} from 'tldraw'

const NOTE_BASE_SIZE = 200

/** Character count threshold above which font size starts shrinking. */
const CHAR_THRESHOLD = 100

/** Minimum font size multiplier to keep text readable. */
const MIN_FONT_SCALE = 0.45

function isRichTextEmpty(richText: { content: unknown[] }) {
	return richText.content.length === 1 && !(richText.content[0] as { content?: unknown }).content
}

/** Extract plain-text character count from TipTap richText JSON. */
function getRichTextLength(richText: { content: unknown[] }): number {
	let len = 0
	const walk = (node: unknown) => {
		if (!node || typeof node !== 'object') return
		const n = node as { type?: string; text?: string; content?: unknown[] }
		if (n.type === 'text' && typeof n.text === 'string') {
			len += n.text.length
		}
		if (Array.isArray(n.content)) {
			for (const child of n.content) walk(child)
		}
	}
	for (const child of richText.content) walk(child)
	return len
}

function useIsShapeReadyForEditing(shapeId: TLShapeId) {
	const editor = useEditor()
	return useValue('isReadyForEditing', () => {
		const editingId = editor.getEditingShapeId()
		return editingId !== null && (editingId === shapeId || editor.getHoveredShapeId() === shapeId)
	}, [editor, shapeId])
}

/**
 * Forces note behavior for the mandala:
 * - always user-resizable by scale
 * - keeps notes circular by preventing vertical growth
 * - constrains text to the inscribed square of the circle
 */
export class CircularNoteShapeUtil extends NoteShapeUtil {
	override options = {
		resizeMode: 'scale' as const,
	}

	override hideSelectionBoundsBg() {
		return true
	}

	override hideSelectionBoundsFg() {
		return true
	}

	override getDefaultProps(): TLNoteShape['props'] {
		return {
			...super.getDefaultProps(),
			align: 'middle',
			verticalAlign: 'middle',
		}
	}

	override onBeforeCreate(next: TLNoteShape) {
		const adjusted = super.onBeforeCreate(next) ?? next
		return this.enforceCircularProps(adjusted)
	}

	override onBeforeUpdate(prev: TLNoteShape, next: TLNoteShape) {
		const adjusted = super.onBeforeUpdate(prev, next) ?? next
		return this.enforceCircularProps(adjusted)
	}

	override component(shape: TLNoteShape) {
		const {
			id,
			type,
			props: {
				labelColor,
				scale,
				color,
				font,
				size,
				align,
				richText,
				verticalAlign,
				fontSizeAdjustment,
			},
		} = shape

		// biome-ignore lint/correctness/useHookAtTopLevel: tldraw component() methods use hooks
		const editor = useEditor()
		const theme = getDefaultColorTheme({ isDarkMode: editor.user.getIsDarkMode() })
		const nw = NOTE_BASE_SIZE * scale
		const nh = NOTE_BASE_SIZE * scale

		// biome-ignore lint/correctness/useHookAtTopLevel: tldraw component() methods use hooks
		const isDarkMode = useValue('dark mode', () => editor.user.getIsDarkMode(), [editor])
		const isSelected = shape.id === editor.getOnlySelectedShapeId()
		// biome-ignore lint/correctness/useHookAtTopLevel: tldraw component() methods use hooks
		const isReadyForEditing = useIsShapeReadyForEditing(id)
		const isEmpty = isRichTextEmpty(richText)

		// biome-ignore lint/correctness/useHookAtTopLevel: tldraw component() methods use hooks
		const handleKeyDown = useCallback((e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.preventDefault()
			}
		}, [])

		// Shrink font when text exceeds character threshold
		const charCount = getRichTextLength(richText)
		const fontScale =
			charCount <= CHAR_THRESHOLD
				? 1
				: Math.max(MIN_FONT_SCALE, Math.sqrt(CHAR_THRESHOLD / charCount))

		// Inscribed square: side = diameter / √2, offset = (diameter - side) / 2
		const inscribedSide = nw / Math.SQRT2
		const inscribedOffset = (nw - inscribedSide) / 2

		return (
			<div
				id={id}
				className="tl-note__container"
				style={{
					width: nw,
					height: nh,
					backgroundColor: getColorValue(theme, color, 'noteFill'),
					borderBottom: isDarkMode
						? `${2 * scale}px solid rgb(20, 20, 20)`
						: `${2 * scale}px solid rgb(144, 144, 144)`,
				}}
			>
				{(isSelected || isReadyForEditing || !isEmpty) && (
					<div
						style={{
							position: 'absolute',
							top: inscribedOffset,
							left: inscribedOffset,
							width: inscribedSide,
							height: inscribedSide,
							overflow: 'hidden',
						}}
					>
						<RichTextLabel
							shapeId={id}
							type={type}
							font={font}
							fontSize={(fontSizeAdjustment || LABEL_FONT_SIZES[size]) * scale * fontScale}
							lineHeight={TEXT_PROPS.lineHeight}
							align={align}
							verticalAlign={verticalAlign}
							richText={richText}
							isSelected={isSelected}
							labelColor={
								labelColor === 'black'
									? getColorValue(theme, color, 'noteText')
									: getColorValue(theme, labelColor, 'fill')
							}
							wrap
							padding={8 * scale}
							hasCustomTabBehavior
							showTextOutline={false}
							onKeyDown={handleKeyDown}
						/>
					</div>
				)}
			</div>
		)
	}

	override indicator(shape: TLNoteShape) {
		const diameter = NOTE_BASE_SIZE * shape.props.scale
		const radius = diameter / 2
		return <circle cx={radius} cy={radius} r={radius} />
	}

	override getGeometry(shape: TLNoteShape) {
		const diameter = NOTE_BASE_SIZE * shape.props.scale
		const radius = diameter / 2
		return new Group2d({
			children: [
				new Circle2d({
					x: 0,
					y: 0,
					radius,
					isFilled: true,
				}),
			],
		})
	}

	private enforceCircularProps(shape: TLNoteShape): TLNoteShape {
		if (shape.props.growY === 0) return shape

		return {
			...shape,
			props: {
				...shape.props,
				growY: 0,
			},
		}
	}
}
