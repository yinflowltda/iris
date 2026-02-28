import { useCallback, useRef, useState } from 'react'
import type { CoverContent } from '../../shared/types/MandalaTypes'
import { GooeyTextMorphing } from './GooeyTextMorphing'
import { useMandalaCoverActions } from './MandalaCoverContext'
import './MandalaCover.css'

interface MandalaCoverProps {
	content: CoverContent
	onDismiss: () => void
}

export function MandalaCover({ content, onDismiss }: MandalaCoverProps) {
	const { onCoverSlideClick } = useMandalaCoverActions()
	const [fadingOut, setFadingOut] = useState(false)
	const currentSlideRef = useRef(0)

	const handleClick = useCallback(() => {
		const slideText = content.slides[currentSlideRef.current]
		onCoverSlideClick(slideText)
		setFadingOut(true)
	}, [content.slides, onCoverSlideClick])

	const handleTextChange = useCallback((index: number) => {
		currentSlideRef.current = index
	}, [])

	return (
		<div
			className={`mandala-cover${fadingOut ? ' mandala-cover--fading' : ''}`}
			onTransitionEnd={(e) => {
				if (e.propertyName === 'opacity') {
					onDismiss()
				}
			}}
			onPointerDown={(e) => {
				e.stopPropagation()
				handleClick()
			}}
		>
			<GooeyTextMorphing
				texts={content.slides}
				morphTime={2.52}
				cooldownTime={3.9}
				className="text-carousel"
				textClassName="text-carousel__slide"
				onTextChange={handleTextChange}
			/>
		</div>
	)
}
