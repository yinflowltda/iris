import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
	FLConsentManager,
	getFLConsent,
	type FLConsentState,
} from '../lib/flora/fl-consent'
import { getFLTelemetry, type FLTelemetryState } from '../lib/flora/fl-telemetry'
import './FLSettingsPanel.css'

// ─── Component ──────────────────────────────────────────────────────────────

export function FLSettingsPanel({
	visible,
	onRequestClose,
}: {
	visible: boolean
	onRequestClose: () => void
}) {
	const [consent, setConsent] = useState<FLConsentState>(() => getFLConsent().state)
	const [telemetry, setTelemetry] = useState<FLTelemetryState>(() => getFLTelemetry().state)

	// Subscribe to consent changes
	useEffect(() => {
		const mgr = getFLConsent()
		setConsent(mgr.state)
		return mgr.onChange(setConsent)
	}, [])

	// Refresh telemetry when panel opens
	useEffect(() => {
		if (visible) {
			setTelemetry(getFLTelemetry().state)
		}
	}, [visible])

	// Close on Escape
	useEffect(() => {
		if (!visible) return
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onRequestClose()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [onRequestClose, visible])

	// Backdrop click closes
	const handleOverlayPointerDown = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (!visible) return
			const target = e.target as HTMLElement | null
			if (!target) return
			if (target.closest('.fl-modal')) return
			onRequestClose()
		},
		[onRequestClose, visible],
	)

	const handleToggle = useCallback(() => {
		const mgr = getFLConsent()
		if (mgr.isOptedIn) {
			mgr.optOut()
		} else {
			mgr.optIn()
		}
	}, [])

	const isChecked = consent.status === 'opted_in'
	const isEU = consent.isEU

	return (
		<div
			className="fl-overlay"
			data-visible={visible}
			onPointerDown={handleOverlayPointerDown}
		>
			<div className="fl-modal">
				<header className="fl-header">
					<h2 className="fl-title">Privacy & Learning</h2>
					<p className="fl-subtitle">
						Control how your Iris contributes to and benefits from shared learning.
					</p>
				</header>

				{/* GDPR notice for EU users */}
				{isEU && (
					<div className="fl-gdpr-notice">
						<span className="fl-gdpr-icon" aria-hidden="true">!</span>
						<p className="fl-gdpr-text">
							Under GDPR, your explicit consent is required before any data processing.
							Federated learning will not activate until you explicitly opt in below.
						</p>
					</div>
				)}

				{/* Privacy guarantees */}
				<div className="fl-privacy-info">
					<div className="fl-privacy-item">
						<span className="fl-privacy-check" aria-hidden="true">+</span>
						<p className="fl-privacy-text">
							Your notes and text never leave your device
						</p>
					</div>
					<div className="fl-privacy-item">
						<span className="fl-privacy-check" aria-hidden="true">+</span>
						<p className="fl-privacy-text">
							Only encrypted model improvements are shared (CKKS homomorphic encryption)
						</p>
					</div>
					<div className="fl-privacy-item">
						<span className="fl-privacy-check" aria-hidden="true">+</span>
						<p className="fl-privacy-text">
							Differential privacy adds mathematical noise so no individual can be identified
						</p>
					</div>
					<div className="fl-privacy-item">
						<span className="fl-privacy-check" aria-hidden="true">+</span>
						<p className="fl-privacy-text">
							You can opt out at any time — participation is always voluntary
						</p>
					</div>
				</div>

				{/* Toggle */}
				<div className="fl-toggle-row">
					<div className="fl-toggle-label">
						<p className="fl-toggle-title">Federated Learning</p>
						<p className="fl-toggle-desc">
							{isChecked
								? 'Your Iris is learning from the community and sharing back.'
								: 'Enable to improve your map with insights from other users.'}
						</p>
					</div>
					<label className="fl-switch">
						<input
							type="checkbox"
							checked={isChecked}
							onChange={handleToggle}
							aria-label="Enable federated learning"
						/>
						<span className="fl-switch-track" />
						<span className="fl-switch-thumb" />
					</label>
				</div>

				{/* Stats (only when opted in and have data) */}
				{isChecked && telemetry.totalRounds > 0 && (
					<div className="fl-stats">
						<div className="fl-stat">
							<span className="fl-stat-value">{telemetry.totalRounds}</span>
							<span className="fl-stat-label">Rounds</span>
						</div>
						<div className="fl-stat">
							<span className="fl-stat-value">
								{telemetry.avgRecentLoss > 0
									? telemetry.avgRecentLoss.toFixed(3)
									: '--'}
							</span>
							<span className="fl-stat-label">Avg Loss</span>
						</div>
						<div className="fl-stat">
							<span className="fl-stat-value">
								{telemetry.cumulativeEpsilon > 0
									? telemetry.cumulativeEpsilon.toFixed(2)
									: '--'}
							</span>
							<span className="fl-stat-label">Privacy</span>
						</div>
					</div>
				)}

				<button className="fl-close" onClick={onRequestClose} type="button">
					Close
				</button>
			</div>
		</div>
	)
}
