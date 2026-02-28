import {
	Circle2d,
	FONT_FAMILIES,
	getColorValue,
	getDefaultColorTheme,
	Group2d,
	LABEL_FONT_SIZES,
	NoteShapeUtil,
	renderHtmlFromRichTextForMeasurement,
	RichTextLabel,
	TEXT_PROPS,
	type TLNoteShape,
	useEditor,
	useValue,
} from 'tldraw'
import { fitFontToBox } from '../lib/circular-note-font-fit'

const NOTE_BASE_SIZE = 200
const CONTENT_PADDING = 8

/**
 * Forces note behavior for the mandala:
 * - always user-resizable by scale
 * - keeps notes circular by preventing vertical growth
 * - constrains text to the inscribed square of the circle
 * - circular hit-testing and indicator
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
		const isEditing = useValue(
			'isEditing',
			() => editor.getEditingShapeId() === id,
			[editor, id],
		)

		const isEmpty =
			richText.content.length === 1 &&
			!(richText.content[0] as { content?: unknown }).content

		// Inscribed square: side = diameter / √2, offset = (diameter - side) / 2
		const inscribedSide = nw / Math.SQRT2
		const inscribedOffset = (nw - inscribedSide) / 2

		const fontSize = (fontSizeAdjustment || LABEL_FONT_SIZES[size]) * scale

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
				{(isSelected || isEditing || !isEmpty) && (
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
							fontSize={fontSize}
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
							padding={CONTENT_PADDING * scale}
							hasCustomTabBehavior
							showTextOutline={false}
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
		const { richText, growY, fontSizeAdjustment: currentAdj, size, font } = shape.props

		const isEmpty =
			richText.content.length === 1 &&
			!(richText.content[0] as { content?: unknown }).content

		// Compute required font size adjustment
		let nextFontSizeAdj = 0
		if (!isEmpty) {
			const inscribedSide = NOTE_BASE_SIZE / Math.SQRT2
			const maxHeight = inscribedSide - CONTENT_PADDING * 2
			const baseFontSize = LABEL_FONT_SIZES[size]
			const html = renderHtmlFromRichTextForMeasurement(this.editor, richText)

			const fitted = fitFontToBox({
				baseFontSize,
				maxHeight,
				measure: (fontSize) =>
					this.editor.textMeasure.measureHtml(html, {
						...TEXT_PROPS,
						fontFamily: FONT_FAMILIES[font],
						fontSize,
						maxWidth: inscribedSide - CONTENT_PADDING * 2,
					}),
			})

			// Only set fontSizeAdjustment when font needed shrinking
			if (fitted < baseFontSize) {
				nextFontSizeAdj = fitted
			}
		}

		const needsUpdate =
			growY !== 0 ||
			currentAdj !== nextFontSizeAdj

		if (!needsUpdate) return shape

		return {
			...shape,
			props: {
				...shape.props,
				growY: 0,
				fontSizeAdjustment: nextFontSizeAdj,
			},
		}
	}
}
