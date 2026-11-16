// Server-side model provider client. Speaks the OpenAI-compatible chat and embeddings
// protocol, which Gemini, Groq, OpenRouter, Ollama and OpenAI all expose, so switching
// provider is configuration, not code. Keys are read from server environment variables
// only and never reach the browser.

export const PRESETS = {
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.5-flash-lite',
    // Tried when the primary model is overloaded (503), rate limited or times out.
    fallbackModel: 'gemini-3.1-flash-lite',
    embedModel: 'gemini-embedding-001',
    keyEnv: 'GEMINI_API_KEY',
  },
  groq: {baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', embedModel: null, keyEnv: 'GROQ_API_KEY'},
  openrouter: {baseUrl: 'https://openrouter.ai/api/v1', model: '', embedModel: null, keyEnv: 'OPENROUTER_API_KEY'},
  ollama: {baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2', embedModel: 'nomic-embed-text', keyEnv: null},
  openai: {baseUrl: 'https://api.openai.com/v1', model: '', embedModel: 'text-embedding-3-small', keyEnv: 'OPENAI_API_KEY'},
};

/** Errors carry a kind so callers can choose a fallback without parsing messages. */
export class ProviderError extends Error {
  constructor(kind, message, {status = null, retryAfterMs = null} = {}) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind; // config | rate_limit | timeout | upstream | malformed | refused
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// Reads configuration from the environment. Returns null when AI is not configured.
export function providerConfig(env = process.env) {
  const name = (env.LLM_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : '')).toLowerCase();
  if (!name || env.LLM_DISABLED === 'true') return null;
  const preset = PRESETS[name];
  if (!preset && !env.LLM_BASE_URL) return null;
  const key = env.LLM_API_KEY || (preset?.keyEnv ? env[preset.keyEnv] : '') || '';
  const model = env.LLM_MODEL || preset?.model || '';
  if (!model || (preset?.keyEnv && !key)) return null;
  return {
    provider: name,
    baseUrl: (env.LLM_BASE_URL || preset.baseUrl).replace(/\/$/, ''),
    model,
    fallbackModel: env.LLM_FALLBACK_MODEL === 'none' ? null : env.LLM_FALLBACK_MODEL || (env.LLM_MODEL ? null : preset?.fallbackModel) || null,
    embedModel: env.EMBED_MODEL === 'none' ? null : env.EMBED_MODEL || preset?.embedModel || null,
    key,
    timeoutMs: Number(env.LLM_TIMEOUT_MS || 20000),
    retries: Number(env.LLM_RETRIES ?? 2),
  };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryAfter(response) {
  const header = response.headers?.get?.('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

export function createProvider(config, {transport = fetch, wait = sleep} = {}) {
  if (!config) throw new ProviderError('config', 'AI is not configured on the server.');

  async function call(path, body) {
    let lastError;
    for (let attempt = 0; attempt <= config.retries; attempt++) {
      if (attempt) await wait(Math.min(lastError?.retryAfterMs ?? 600 * 2 ** (attempt - 1), 8000));
      let response;
      try {
        response = await transport(`${config.baseUrl}${path}`, {
          method: 'POST',
          signal: AbortSignal.timeout(config.timeoutMs),
          headers: {'Content-Type': 'application/json', ...(config.key ? {Authorization: `Bearer ${config.key}`} : {})},
          body: JSON.stringify(body),
        });
      } catch (error) {
        const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        lastError = new ProviderError(timeout ? 'timeout' : 'upstream',
          timeout ? `The model did not respond within ${Math.round(config.timeoutMs / 1000)} s.` : 'The model provider could not be reached.');
        continue;
      }
      if (response.ok) {
        try { return await response.json(); } catch { throw new ProviderError('malformed', 'The provider returned an unreadable response.'); }
      }
      // Response bodies are not echoed: they can contain request details.
      if (response.status === 429) {
        lastError = new ProviderError('rate_limit', 'The free-tier model rate limit was reached. Try again in a minute.', {status: 429, retryAfterMs: retryAfter(response)});
        continue;
      }
      if (response.status >= 500) { lastError = new ProviderError('upstream', `The model provider failed (${response.status}).`, {status: response.status}); continue; }
      if (response.status === 401 || response.status === 403 || response.status === 400) {
        throw new ProviderError('config', `The model provider rejected the request (${response.status}). Check the server's API key and model name.`, {status: response.status});
      }
      throw new ProviderError('upstream', `The model provider failed (${response.status}).`, {status: response.status});
    }
    throw lastError;
  }

  async function completeJson(model, {system, user, schema, schemaName = 'answer', maxTokens = 1400, temperature = 0.2}) {
    let lastError;
    // One extra attempt when the model returns text that is not the requested JSON.
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await call('/chat/completions', {
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [{role: 'system', content: system}, {role: 'user', content: user}],
        response_format: {type: 'json_schema', json_schema: {name: schemaName, strict: true, schema}},
      });
      const choice = raw?.choices?.[0];
      const content = choice?.message?.content;
      if (choice?.message?.refusal) throw new ProviderError('refused', 'The model declined this request.');
      if (typeof content !== 'string' || !content.trim()) { lastError = new ProviderError('malformed', 'The model returned an empty answer.'); continue; }
      try {
        const data = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        const usage = raw.usage ? {input_tokens: raw.usage.prompt_tokens ?? null, output_tokens: raw.usage.completion_tokens ?? null} : null;
        return {data, usage, model, truncated: choice.finish_reason === 'length'};
      } catch {
        lastError = new ProviderError('malformed', 'The model returned malformed JSON.');
      }
    }
    throw lastError;
  }

  return {
    name: config.provider,
    model: config.model,
    embedModel: config.embedModel,

    /**
     * Returns {data, usage, model}; data is parsed JSON checked for syntax only. When the
     * primary model is unavailable, the fallback model (if configured) is tried once.
     */
    async json(request) {
      try {
        return await completeJson(config.model, request);
      } catch (error) {
        const transient = error instanceof ProviderError && ['upstream', 'rate_limit', 'timeout'].includes(error.kind);
        if (!transient || !config.fallbackModel || config.fallbackModel === config.model) throw error;
        return completeJson(config.fallbackModel, request);
      }
    },

    /** Returns one vector per input string. */
    async embed(inputs) {
      if (!config.embedModel) throw new ProviderError('config', 'No embedding model is configured.');
      const raw = await call('/embeddings', {model: config.embedModel, input: inputs});
      const vectors = raw?.data?.map(d => d.embedding);
      if (!Array.isArray(vectors) || vectors.length !== inputs.length || !vectors.every(v => Array.isArray(v) && v.length)) {
        throw new ProviderError('malformed', 'The embedding response was incomplete.');
      }
      return vectors;
    },
  };
}
