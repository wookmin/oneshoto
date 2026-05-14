const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_NAME = 'meta-llama/llama-3.3-70b-instruct:free';

const systemPrompt = `You are a travel food advisor. Given a traveler's destination, daily food budget, and travel style, recommend 5 restaurants that realistically fit within that budget. For each restaurant, also provide the most practical way to get there from the city center and the estimated one-way transit cost. Respond ONLY in valid JSON with no extra text.

OUTPUT FORMAT:
{
  "destination": "string",
  "daily_food_budget": number,
  "currency": "string",
  "reasoning": "string (2-3 sentences: why these restaurants fit this budget and style in this city)",
  "restaurants": [
    {
      "name": "string",
      "cuisine": "string",
      "price_per_person": number,
      "price_currency": "string",
      "price_level": "budget | mid | splurge",
      "why": "string (one sentence)",
      "tip": "string (one practical visiting tip)",
      "transit": {
        "method": "string (e.g. subway line 2, bus 103, walking)",
        "duration_minutes": number,
        "cost": number,
        "cost_currency": "string"
      }
    }
  ]
}`;

export async function fetchRecommendations({ city, days, currency, dailyFood, style }) {
  // API key is read from import.meta.env.VITE_OPENROUTER_API_KEY. User must create a .env file in the project root.
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OpenRouter API 키가 없습니다. 프로젝트 루트의 .env 파일을 확인해주세요.');
  }

  const userPrompt = `Recommend restaurants for:
- Destination: ${city}
- Daily food budget: ${dailyFood} ${currency}
- Duration: ${days} days
- Travel style: ${style}`;

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://travelbudget.app',
      'X-Title': 'Travel Budget Planner',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      '추천 요청에 실패했습니다. 네트워크와 API 키를 확인해주세요.';
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new Error('응답 파싱 오류. 다시 시도해주세요.');
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error('응답 파싱 오류. 다시 시도해주세요.');
  }
}
