# AI Conversation Reliability Improvements

## Problem

The AI agent sometimes fails to reply with a follow-up question after the user provides an answer. This has been observed in the emotions map flow but may affect any mandala conversation. The root causes are varied: silent stream completions, truncated outputs, swallowed errors, and model non-compliance.

## Design: 6 Improvements

### 1. Extend "no message" fallback to self-sourced requests

**File:** `client/agent/TldrawAgent.ts`

The existing fallback at line 678-688 only fires when `request.source !== 'self'`. During multi-turn conversations, continuation requests have `source: 'self'`, so if the model fails to produce a `message` action during a self-scheduled continuation, no fallback fires and the agent silently goes idle.

**Change:** Remove the `request.source !== 'self'` guard. Add a `noMessageRetryCount` to prevent infinite loops — if a retry continuation also fails to produce a message, call `this.onError()` instead of scheduling again. Max retries: 1.

### 2. User-visible error handling in `prompt()` catch block

**File:** `client/agent/TldrawAgent.ts`

The catch block at line 329-333 silently returns on error. The user sees nothing and the agent appears stuck.

**Change:** Call `this.onError(e)` in the catch block so the user sees a toast. Transition to `idling` mode so the agent isn't left in a stuck active state.

### 3. Retry mechanism for non-upstream errors

**File:** `worker/do/AgentService.ts`

The retry logic at line 73-93 only retries on `InferenceUpstreamError`. Other transient errors (timeouts, rate limits, malformed output) cause immediate failure.

**Change:** Retry the preferred model once for any error before falling through to fallback models. Add `MAX_SAME_MODEL_RETRIES = 1`. Total attempt sequence becomes: preferred (try 1) -> preferred (try 2) -> fallback models.

### 4. Detect token limit truncation

**File:** `worker/do/AgentService.ts` and `client/agent/TldrawAgent.ts`

If the model hits `maxOutputTokens` (8192), the JSON gets truncated. The `message` action (typically last) may be lost. There's no signal to the client.

**Change (server):** Access `finishReason` from the `streamText` result. When it's `'length'`, yield a special `{ _type: 'truncated' }` sentinel after the last parsed action.

**Change (client):** Detect the truncation sentinel in `streamAgentActions`. If truncation occurred and no `message` was produced, schedule a continuation asking the model to respond to the user.

### 5. Validate message completeness

**File:** `client/agent/TldrawAgent.ts`

Even when a `message` action is produced, it may be empty or truncated (e.g., just whitespace or a few characters from JSON truncation).

**Change:** After all actions are processed, if `hadUserFacingMessage` is true but the last message text is empty/whitespace or under 10 characters, treat it as if no message was sent and trigger the "no message" fallback.

### 6. Conversation watchdog (45-second timeout)

**File:** `client/agent/TldrawAgent.ts`

Last-resort safety net for any case the other improvements miss.

**Change:** Start a 45-second timer when `requestAgentActions` begins. If the request completes (stream finishes, all actions processed) without a meaningful `message` action within that window, call `this.onError()` with a descriptive message. The timer is cleared when a complete message action is produced, when the request is cancelled, or when the request finishes normally (other fallbacks handle the no-message case).

Note: The watchdog specifically covers the case where the stream itself hangs (e.g., the SSE connection stays open but no data arrives). The other improvements handle the case where the stream completes but without a message.

## Files Modified

| File | Changes |
|------|---------|
| `client/agent/TldrawAgent.ts` | Improvements 1, 2, 4 (client), 5, 6 |
| `worker/do/AgentService.ts` | Improvements 3, 4 (server) |
| `shared/types/AgentAction.ts` | Add `truncated` action type for sentinel |

## Risk Assessment

- **Improvement 1:** Low risk. The retry count prevents loops.
- **Improvement 2:** Low risk. Strictly additive error surfacing.
- **Improvement 3:** Low risk. One extra retry attempt. Worst case: slightly slower failure.
- **Improvement 4:** Medium risk. New sentinel type flows through the streaming pipeline. Needs testing.
- **Improvement 5:** Low risk. Stricter validation on existing data.
- **Improvement 6:** Low risk. Timer-based, independent of main flow. Only fires on genuine hangs.
