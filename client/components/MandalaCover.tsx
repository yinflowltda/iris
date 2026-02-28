import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoverContent } from '../../shared/types/MandalaTypes'
import { useMandalaCoverActions } from './MandalaCoverContext'
import './MandalaCover.css'

interface MandalaCoverProps {
	content: CoverContent
	w: number
	h: number
	onDismiss: () => void
}

export function MandalaCover({ content, w, h, onDismiss }: MandalaCoverProps) {
	const { onCoverSlideClick } = useMandalaCoverActions()
	const [fadingOut, setFadingOut] = useState(false)
	const currentSlideRef = useRef(0)

	const handleClick = useCallback(() => {
		const slideText = content.slides[currentSlideRef.current]
		onCoverSlideClick(slideText)
		setFadingOut(true)
	}, [content.slides, onCoverSlideClick])

	const handleFadeOutEnd = useCallback(() => {
		if (fadingOut) {
			onDismiss()
		}
	}, [fadingOut, onDismiss])

	const handleSlideChange = useCallback((index: number) => {
		currentSlideRef.current = index
	}, [])

	return (
		<div
			className={`mandala-cover${fadingOut ? ' mandala-cover--fading' : ''}`}
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				width: w,
				height: h,
				borderRadius: '50%',
				pointerEvents: 'all',
			}}
			onTransitionEnd={(e) => {
				if (e.propertyName === 'opacity') {
					handleFadeOutEnd()
				}
			}}
			onPointerDown={(e) => {
				e.stopPropagation()
				handleClick()
			}}
		>
			<TextCarousel
				slides={content.slides}
				intervalMs={content.intervalMs}
				onSlideChange={handleSlideChange}
			/>
		</div>
	)
}

interface TextCarouselProps {
	slides: string[]
	intervalMs: number
	onSlideChange: (index: number) => void
}

function TextCarousel({ slides, intervalMs, onSlideChange }: TextCarouselProps) {
	const [currentIndex, setCurrentIndex] = useState(0)
	const [visible, setVisible] = useState(true)

	useEffect(() => {
		const fadeOutDuration = 500
		let timeoutId: ReturnType<typeof setTimeout>

		const timer = setInterval(() => {
			setVisible(false)
			timeoutId = setTimeout(() => {
				setCurrentIndex((prev) => {
					const next = (prev + 1) % slides.length
					onSlideChange(next)
					return next
				})
				setVisible(true)
			}, fadeOutDuration)
		}, intervalMs)

		return () => {
			clearInterval(timer)
			clearTimeout(timeoutId)
		}
	}, [slides.length, intervalMs, onSlideChange])

	return (
		<div className="text-carousel">
			<p
				className="text-carousel__slide"
				style={{
					opacity: visible ? 1 : 0,
					transition: 'opacity 500ms ease-in-out',
				}}
			>
				{slides[currentIndex]}
			</p>
		</div>
	)
}
