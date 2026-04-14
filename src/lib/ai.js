// AI assistant - supports OpenAI and Anthropic
export const AI_MODELS = {
  anthropic: [
    { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
};

const SYSTEM_PROMPT = `You are an expert web developer AI assistant integrated into a browser IDE. 
The user will provide you with HTML, CSS, and JavaScript code along with a request.
You MUST respond with a valid JSON object (no markdown, no explanation outside JSON) in this exact format:
{
  "html": "...complete HTML body content...",
  "css": "...complete CSS...",
  "js": "...complete JavaScript...",
  "explanation": "...brief explanation of what you changed..."
}

Rules:
- Always return ALL three code fields, even if unchanged
- HTML should be just the body content, not the full document
- Make the code clean, modern, and production-quality
- If asked to add features, implement them fully
- Preserve existing functionality unless asked to change it`;

export const sendAIMessage = async ({ provider, apiKey, model, html, css, js, prompt, onChunk }) => {
  if (!apiKey) throw new Error('No API key provided');

  const userMessage = `Here is my current code:

HTML:
\`\`\`html
${html}
\`\`\`

CSS:
\`\`\`css
${css}
\`\`\`

JavaScript:
\`\`\`js
${js}
\`\`\`

Request: ${prompt}`;

  if (provider === 'anthropic') {
    return callAnthropic({ apiKey, model, userMessage, onChunk });
  } else {
    return callOpenAI({ apiKey, model, userMessage, onChunk });
  }
};

const callAnthropic = async ({ apiKey, model, userMessage, onChunk }) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  return streamResponse(response, onChunk);
};

const callOpenAI = async ({ apiKey, model, userMessage, onChunk }) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  return streamResponse(response, onChunk, 'openai');
};

const streamResponse = async (response, onChunk, type = 'anthropic') => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        let text = '';
        if (type === 'anthropic') {
          text = parsed.delta?.text || '';
        } else {
          text = parsed.choices?.[0]?.delta?.content || '';
        }
        if (text) {
          fullText += text;
          onChunk?.(text, fullText);
        }
      } catch { /* skip malformed */ }
    }
  }

  return parseAIResponse(fullText);
};

export const parseAIResponse = (text) => {
  // Try to extract JSON from response
  const cleaned = text.trim();
  
  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch { /* */ }

  // Try to find JSON block
  const jsonMatch = cleaned.match(/\{[\s\S]*"html"[\s\S]*"css"[\s\S]*"js"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch { /* */ }
  }

  // Fallback: extract code blocks manually
  const extract = (lang) => {
    const match = cleaned.match(new RegExp(`\`\`\`(?:${lang})?\\n?([\\s\\S]*?)\`\`\``, 'i'));
    return match ? match[1].trim() : '';
  };

  return {
    html: extract('html'),
    css: extract('css'),
    js: extract('(?:js|javascript)'),
    explanation: 'Applied changes (response was not structured JSON)',
  };
};
