import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
	children: ReactNode
	fallback?: ReactNode
	onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
	hasError: boolean
	error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props)
		this.state = { hasError: false, error: null }
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error }
	}

	override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error('[AppErrorBoundary]', error, errorInfo)
		this.props.onError?.(error, errorInfo)
	}

	handleRetry = () => {
		this.setState({ hasError: false, error: null })
	}

	override render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback
			}

			return (
				<div
					style={{
						padding: '24px',
						textAlign: 'center',
						color: 'var(--color-text-1, #333)',
						fontFamily: 'Inter, sans-serif',
					}}
				>
					<h3 style={{ marginBottom: '8px' }}>Something went wrong</h3>
					<p style={{ marginBottom: '16px', opacity: 0.7, fontSize: '14px' }}>
						{this.state.error?.message || 'An unexpected error occurred'}
					</p>
					<button
						type="button"
						onClick={this.handleRetry}
						style={{
							padding: '8px 16px',
							borderRadius: '6px',
							border: '1px solid #ccc',
							background: 'white',
							cursor: 'pointer',
							fontSize: '14px',
						}}
					>
						Try again
					</button>
				</div>
			)
		}

		return this.props.children
	}
}
