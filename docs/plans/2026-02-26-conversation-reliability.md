# Conversation Reliability Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI conversation responses more reliable by adding fallbacks, retries, truncation detection, message validation, and a watchdog timer.

**Architecture:** Six independent improvements layered as defense-in-depth. Server-side changes (retry logic, truncation detection) in `worker/do/AgentService.ts`. Client-side changes (fallback expansion, error surfacing, validation, watchdog) in `client/agent/TldrawAgent.ts`. One new sentinel type piped through existing SSE streaming.

**Tech Stack:** TypeScript, Vercel AI SDK (`streamText`), Cloudflare Workers, Vitest

---

### Task 1: Add retry for non-upstream errors (server)

**Files:**
- Modify: `worker/do/AgentService.ts:67-93`
- Test: `tests/unit/agent-service-retry.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/agent-service-retry.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

// We test the retry logic conceptually since AgentService needs env bindings.
// We extract the retry helper into a testable function.
import { runWithRetries } from '../../worker/do/retryHelper'

describe('runWithRetries', () => {
	it('retries the same model once on non-upstream error before moving to fallbacks', async () => {
		const attempts: string[] = []
		const result = await runWithRetries(
			['modelA', 'modelB'],
			async (model, attemptIndex) => {
				attempts.push(`${model}:${attemptIndex}`)
				if (attempts.length <= 2) throw new Error('timeout')
				return 'success'
			},
		)
		expect(result).toBe('success')
		// modelA tried twice (attempt 0, attempt 1), then modelB once
		expect(attempts).toEqual(['modelA:0', 'modelA:1', 'modelB:0'])
	})

	it('does not retry same model on upstream error, goes straight to fallback', async () => {
		const attempts: string[] = []
		const result = await runWithRetries(
			['modelA', 'modelB'],
			async (model, attemptIndex) => {
				attempts.push(`${model}:${attemptIndex}`)
				if (model === 'modelA') throw new Error('InferenceUpstreamError: model down')
				return 'success'
			},
		)
		expect(result).toBe('success')
		// modelA tried once, then modelB
		expect(attempts).toEqual(['modelA:0', 'modelB:0'])
	})

	it('throws if all models and retries exhausted', async () => {
		await expect(
			runWithRetries(['modelA'], async () => {
				throw new Error('always fails')
			}),
		).rejects.toThrow('always fails')
	})
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/agent-service-retry.test.ts`
Expected: FAIL — module `../../worker/do/retryHelper` not found

**Step 3: Create the retry helper**

Create `worker/do/retryHelper.ts`:

```typescript
const MAX_SAME_MODEL_RETRIES = 1

function isInferenceUpstreamError(error: unknown): boolean {
	const text = getErrorText(error).toLowerCase()
	return text.includes('inferenceupstreamerror')
}

function getErrorText(error: unknown): string {
	if (error instanceof Error && typeof error.message === 'string' && error.message.length > 0) {
		return error.message
	}
	if (typeof error === 'string' && error.length > 0) {
		return error
	}
	try {
		return JSON.stringify(error) || 'Unknown error'
	} catch {
		return 'Unknown error'
	}
}

/**
 * Run an async function with retry logic:
 * 1. Try preferred model up to MAX_SAME_MODEL_RETRIES+1 times for non-upstream errors
 * 2. On upstream errors, skip retries and go to next model
 * 3. Fall through to fallback models
 */
export async function runWithRetries<T>(
	candidates: string[],
	fn: (model: string, attemptIndex: number) => Promise<T>,
): Promise<T> {
	let lastError: unknown = null

	for (const [modelIndex, model] of candidates.entries()) {
		const maxAttempts = modelIndex === 0 ? MAX_SAME_MODEL_RETRIES + 1 : 1

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				return await fn(model, attempt)
			} catch (error) {
				lastError = error

				// On upstream errors, don't retry same model — go to fallback
				if (isInferenceUpstreamError(error)) {
					break
				}

				// On other errors, retry same model if attempts remain
				const hasMoreAttempts = attempt < maxAttempts - 1
				if (hasMoreAttempts) {
					console.warn(`Error on model ${model} (attempt ${attempt + 1}). Retrying same model.`)
					continue
				}

				// No more retries for this model, fall through to next
			}
		}
	}

	throw lastError
}

export { isInferenceUpstreamError, getErrorText }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/agent-service-retry.test.ts`
Expected: PASS

**Step 5: Integrate into AgentService**

Modify `worker/do/AgentService.ts` — replace the manual retry loop in `streamActions` with the retry helper pattern. Since `streamActions` is an async generator (not a simple async function), we adapt the approach: extract the retry logic for the outer loop and keep the generator yielding internally.

Replace lines 67-93 in `streamActions`:

```typescript
private async *streamActions(prompt: AgentPrompt): AsyncGenerator<Streaming<AgentAction>> {
	const systemPrompt = buildSystemPrompt(prompt)
	const messages: ModelMessage[] = []
	messages.push({ role: 'system', content: systemPrompt })
	const promptMessages = buildMessages(prompt)
	messages.push(...promptMessages)

	const debugPart = prompt.debug as DebugPart | undefined
	if (debugPart) {
		if (debugPart.logSystemPrompt) {
			const promptWithoutSchema = buildSystemPrompt(prompt, { withSchema: false })
			console.log('[DEBUG] System Prompt (without schema):\n', promptWithoutSchema)
		}
		if (debugPart.logMessages) {
			console.log('[DEBUG] Messages:\n', JSON.stringify(promptMessages, null, 2))
		}
	}

	const preferredModel = getModelName(prompt)
	const fallbackModels = getFallbackModels(preferredModel)
	const candidates = [preferredModel, ...fallbackModels]

	const MAX_SAME_MODEL_RETRIES = 1
	let lastError: unknown = null

	for (const [modelIndex, modelName] of candidates.entries()) {
		const maxAttempts = modelIndex === 0 ? MAX_SAME_MODEL_RETRIES + 1 : 1

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				yield* this.streamActionsWithModel(modelName, messages)
				return
			} catch (error: any) {
				lastError = error

				if (isInferenceUpstreamError(error)) {
					const nextModel = candidates[modelIndex + 1]
					if (nextModel) {
						console.warn(`Upstream error on model ${modelName}. Trying fallback ${nextModel}.`)
					}
					break // skip retries, go to next model
				}

				const hasMoreAttempts = attempt < maxAttempts - 1
				if (hasMoreAttempts) {
					console.warn(`Error on model ${modelName} (attempt ${attempt + 1}). Retrying same model.`)
					continue
				}

				const hasMoreModels = modelIndex < candidates.length - 1
				if (hasMoreModels) {
					console.warn(`All retries failed for ${modelName}. Trying fallback ${candidates[modelIndex + 1]}.`)
				}
			}
		}
	}

	console.error('streamActions error: all models and retries exhausted', lastError)
	throw toReadableError(lastError)
}
```

**Step 6: Run full tests**

Run: `npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add worker/do/retryHelper.ts worker/do/AgentService.ts tests/unit/agent-service-retry.test.ts
git commit -m "feat(worker): retry same model once on non-upstream errors before fallback"
```

---

### Task 2: Detect token limit truncation (server + client)

**Files:**
- Modify: `worker/do/AgentService.ts:95-169` (streamActionsWithModel)
- Modify: `client/agent/TldrawAgent.ts:711-757` (streamAgentActions) and `requestAgentActions`
- Test: `tests/unit/truncation-detection.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/truncation-detection.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

describe('truncation sentinel', () => {
	it('truncation sentinel has correct shape', () => {
		const sentinel = { _type: '_truncated' as const, complete: true, time: 0 }
		expect(sentinel._type).toBe('_truncated')
		expect(sentinel.complete).toBe(true)
	})
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/truncation-detection.test.ts`
Expected: PASS (this is a shape test, it should pass immediately)

**Step 3: Modify server to detect truncation and yield sentinel**

In `worker/do/AgentService.ts`, modify `streamActionsWithModel`. Destructure `finishReason` from `streamText`, and after consuming the text stream, check if the finish reason is `'length'`:

```typescript
private async *streamActionsWithModel(
	modelName: AgentModelName,
	messages: ModelMessage[],
): AsyncGenerator<Streaming<AgentAction>> {
	const model = this.getModel(modelName)

	if (typeof model === 'string') {
		throw new Error('Model is a string, not a LanguageModel')
	}

	const streamResult = streamText({
		model,
		messages,
		maxOutputTokens: 8192,
		temperature: 0,
		onAbort() {
			console.warn('Stream actions aborted')
		},
		onError: (e) => {
			console.error('Stream text error:', e)
			throw e
		},
	})

	let buffer = ''
	let lastActionIndex = -1
	let maybeIncompleteAction: AgentAction | null = null

	let startTime = Date.now()
	for await (const text of streamResult.textStream) {
		buffer += text

		const partialObject = tryParseStreamingJson(buffer)
		if (!partialObject) continue

		const actions = partialObject.actions
		if (!Array.isArray(actions)) continue
		if (actions.length === 0) continue

		const latestIndex = actions.length - 1

		if (latestIndex !== lastActionIndex) {
			if (maybeIncompleteAction) {
				yield {
					...maybeIncompleteAction,
					complete: true,
					time: Date.now() - startTime,
				}
				maybeIncompleteAction = null
			}

			lastActionIndex = latestIndex
			startTime = Date.now()
		}

		const latestAction = actions[latestIndex] as AgentAction | undefined
		if (!latestAction || !latestAction._type) continue

		maybeIncompleteAction = latestAction
		yield {
			...latestAction,
			complete: false,
			time: Date.now() - startTime,
		}
	}

	if (maybeIncompleteAction) {
		yield {
			...maybeIncompleteAction,
			complete: true,
			time: Date.now() - startTime,
		}
	}

	// Check if output was truncated due to token limit
	const reason = await streamResult.finishReason
	if (reason === 'length') {
		console.warn('Stream truncated due to maxOutputTokens limit')
		yield {
			_type: '_truncated',
			complete: true,
			time: Date.now() - startTime,
		} as any
	}
}
```

**Step 4: Modify client to detect truncation sentinel**

In `client/agent/TldrawAgent.ts`, modify `requestAgentActions` to track truncation.

Add a `wasTruncated` flag alongside `hadUserFacingMessage`:

```typescript
// Inside requestAgentActions, after `let hadUserFacingMessage = false`:
let wasTruncated = false
```

Inside the `for await` loop, before processing actions, check for the sentinel:

```typescript
for await (const action of this.streamAgentActions({ prompt, signal })) {
	if (cancelled) break

	// Detect truncation sentinel from server
	if ((action as any)._type === '_truncated') {
		wasTruncated = true
		continue
	}

	// ... rest of action processing
}
```

After the loop, add truncation handling before the existing no-message check:

```typescript
if (!cancelled && wasTruncated && !hadUserFacingMessage) {
	console.warn('[Agent] Response truncated by token limit — scheduling continuation for message')
	this.schedule({
		agentMessages: ['Your previous response was cut off before you could send a message to the user. Please respond to the user now.'],
	})
}
```

**Step 5: Run full tests**

Run: `npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add worker/do/AgentService.ts client/agent/TldrawAgent.ts tests/unit/truncation-detection.test.ts
git commit -m "feat: detect token limit truncation and schedule follow-up for missing message"
```

---

### Task 3: Extend "no message" fallback to self-sourced requests

**Files:**
- Modify: `client/agent/TldrawAgent.ts:678-688`

**Step 1: Understand the current code**

Current code at line 678-688:
```typescript
if (
	!cancelled &&
	!hadUserFacingMessage &&
	availableActions.includes('message') &&
	request.source !== 'self'  // <-- this blocks self-sourced retries
) {
	console.warn('[Agent] Request completed without a user-facing message — scheduling continuation')
	this.schedule({ data: ['No message was sent to the user. Please respond now.'] })
}
```

**Step 2: Add no-message retry tracking**

Add a private field to `TldrawAgent`:

```typescript
private noMessageRetryCount = 0
```

Reset it in the `reset()` method and at the start of non-self requests in `requestAgentActions`.

**Step 3: Modify the fallback logic**

Replace the existing no-message check with:

```typescript
if (!cancelled && !hadUserFacingMessage && availableActions.includes('message')) {
	if (request.source !== 'self') {
		// User-initiated request without message — always retry
		this.noMessageRetryCount = 0
		console.warn('[Agent] Request completed without a user-facing message — scheduling continuation')
		this.schedule({ agentMessages: ['No message was sent to the user. Please respond now.'] })
	} else if (this.noMessageRetryCount < 1) {
		// Self-sourced request without message — retry once
		this.noMessageRetryCount++
		console.warn('[Agent] Self-sourced request completed without message — retrying once')
		this.schedule({ agentMessages: ['No message was sent to the user. Please respond now.'] })
	} else {
		// Already retried once, give up and error
		this.noMessageRetryCount = 0
		console.error('[Agent] Self-sourced request failed to produce message after retry')
		this.onError(new Error('The AI was unable to generate a response. Please try again.'))
	}
}
```

Also reset the counter when a message IS produced:
```typescript
if (transformedAction._type === 'message' && transformedAction.complete) {
	hadUserFacingMessage = true
	this.noMessageRetryCount = 0  // <-- add this
}
```

**Step 4: Run full tests**

Run: `npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add client/agent/TldrawAgent.ts
git commit -m "feat(client): extend no-message fallback to self-sourced requests with retry limit"
```

---

### Task 4: Validate message completeness

**Files:**
- Modify: `client/agent/TldrawAgent.ts` (requestAgentActions)

**Step 1: Add message content tracking**

Alongside `hadUserFacingMessage`, track the actual last message text:

```typescript
let lastMessageText = ''
```

Update where `hadUserFacingMessage` is set:

```typescript
if (transformedAction._type === 'message' && transformedAction.complete) {
	hadUserFacingMessage = true
	lastMessageText = (transformedAction as any).text || ''
	this.noMessageRetryCount = 0
}
```

**Step 2: Add validation after the loop**

After `await Promise.all(actionPromises)`, before the no-message check, add:

```typescript
// Treat empty/trivially short messages as no message
if (hadUserFacingMessage && lastMessageText.trim().length < 10) {
	console.warn('[Agent] Message action produced but content too short/empty — treating as no message')
	hadUserFacingMessage = false
}
```

This way the existing no-message fallback handles it.

**Step 3: Run full tests**

Run: `npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add client/agent/TldrawAgent.ts
git commit -m "feat(client): validate message completeness — treat empty/short messages as missing"
```

---

### Task 5: User-visible error handling in prompt() catch block

**Files:**
- Modify: `client/agent/TldrawAgent.ts:327-334`

**Step 1: Modify the catch block**

Current code:
```typescript
try {
	await this.request(request)
} catch (e) {
	console.error('Error data:', e)
	this.requests.setIsPrompting(false)
	this.requests.setCancelFn(null)
	return
}
```

Replace with:
```typescript
try {
	await this.request(request)
} catch (e) {
	console.error('Error data:', e)
	this.onError(e)
	this.mode.setMode('idling')
	this.requests.setIsPrompting(false)
	this.requests.setCancelFn(null)
	return
}
```

**Step 2: Run full tests**

Run: `npx vitest run`
Expected: All PASS

**Step 3: Commit**

```bash
git add client/agent/TldrawAgent.ts
git commit -m "fix(client): surface errors from prompt() to user instead of silently swallowing"
```

---

### Task 6: Conversation watchdog (45-second timeout)

**Files:**
- Modify: `client/agent/TldrawAgent.ts` (requestAgentActions)

**Step 1: Add watchdog timer**

In `requestAgentActions`, after the `const requestPromise = (async () => {` block starts, add a watchdog:

```typescript
const WATCHDOG_TIMEOUT_MS = 45_000
let watchdogTimer: ReturnType<typeof setTimeout> | null = null
let watchdogFired = false

// Start watchdog — fires if stream hangs without producing a message
watchdogTimer = setTimeout(() => {
	if (!hadUserFacingMessage && !cancelled) {
		watchdogFired = true
		console.error('[Agent] Watchdog: 45s elapsed without a message — aborting')
		controller.abort('Watchdog timeout')
	}
}, WATCHDOG_TIMEOUT_MS)
```

**Step 2: Clear watchdog on completion**

At the end of the `requestPromise` async block (after `await Promise.all(actionPromises)` and all the fallback checks), clear the timer:

```typescript
if (watchdogTimer) {
	clearTimeout(watchdogTimer)
	watchdogTimer = null
}
```

Also clear it in the catch block:
```typescript
} catch (e) {
	if (watchdogTimer) {
		clearTimeout(watchdogTimer)
		watchdogTimer = null
	}
	if (watchdogFired) {
		this.onError(new Error('The AI took too long to respond. Please try again.'))
		return
	}
	if (e === 'Cancelled by user' || (e instanceof Error && e.name === 'AbortError')) {
		return
	}
	this.onError(e)
}
```

**Step 3: Clear watchdog when message is produced**

Where `hadUserFacingMessage = true` is set, also clear the watchdog:

```typescript
if (transformedAction._type === 'message' && transformedAction.complete) {
	hadUserFacingMessage = true
	lastMessageText = (transformedAction as any).text || ''
	this.noMessageRetryCount = 0
	if (watchdogTimer) {
		clearTimeout(watchdogTimer)
		watchdogTimer = null
	}
}
```

**Step 4: Run full tests**

Run: `npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add client/agent/TldrawAgent.ts
git commit -m "feat(client): add 45-second watchdog timer for hung AI responses"
```

---

### Task 7: Final integration test and cleanup

**Files:**
- Test: `tests/unit/agent-service-retry.test.ts` (already created)
- Test: `tests/unit/truncation-detection.test.ts` (already created)

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Run linter**

Run: `npx biome check .`
Expected: No errors (or fix any)

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: fix lint/type issues from reliability improvements"
```
