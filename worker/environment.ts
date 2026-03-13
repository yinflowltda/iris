export interface Environment {
	AGENT_DURABLE_OBJECT: DurableObjectNamespace
	VOICE_AGENT_DO: DurableObjectNamespace
	AGGREGATION_DO: DurableObjectNamespace
	AI: Ai
	FL_BUCKET: R2Bucket
	TTS_ENABLED: string | undefined
	OPENAI_COMPATIBLE_BASE_URL: string | undefined
	OPENAI_COMPATIBLE_API_KEY: string | undefined
}
