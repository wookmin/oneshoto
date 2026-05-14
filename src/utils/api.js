const DEFAULT_MODEL_NAME = 'gemini-2.5-flash';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_RATE_LIMIT_RETRY_WAIT_MS = 2500;

const categoryConfigs = {
  food: {
    label: '맛집/카페',
    prompt:
      'Recommend exactly 3 restaurants or cafes near the user. Prioritize practical, locally useful, budget-fitting options.',
  },
  shopping: {
    label: '쇼핑',
    prompt:
      'Recommend exactly 3 shopping spots near the user. Prioritize value-for-money places that fit the total budget.',
  },
  attraction: {
    label: '명소',
    prompt:
      'Recommend exactly 3 attractions near the user. Prioritize budget-friendly, worthwhile places with realistic visit costs.',
  },
};

const systemPrompt = `You are a travel location advisor. You recommend practical nearby places based on the user's total travel budget and current location.

Return ONLY valid JSON in this format:
{
  "category": "food | shopping | attraction",
  "destination": "string",
  "food_budget_total": number,
  "currency": "string",
  "reasoning": "string",
  "places": [
    {
      "name": "string",
      "type": "string",
      "price_estimate": number,
      "price_currency": "string",
      "price_level": "budget | mid | splurge",
      "rating_hint": "string",
      "why": "string",
      "tip": "string",
      "transit": {
        "method": "string",
        "duration_minutes": number,
        "cost": number,
        "cost_currency": "string"
      }
    }
  ]
}`;

function formatRateLimitMessage(retryAfterHeader) {
  const retryAfterSeconds = Number(retryAfterHeader);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return `요청이 너무 많습니다. 약 ${retryAfterSeconds}초 후 다시 시도해주세요.`;
  }

  return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getConfiguredModels() {
  const primaryModel = (import.meta.env.VITE_GEMINI_MODEL || DEFAULT_MODEL_NAME).trim();
  const fallbackModels = (import.meta.env.VITE_GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return [primaryModel, ...fallbackModels].filter(
    (model, index, models) => model && models.indexOf(model) === index,
  );
}

function extractJsonObject(text) {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error('응답 파싱 오류. 다시 시도해주세요.');
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizePlace(place, category) {
  const rawPriceEstimate = Number(place?.price_estimate ?? place?.price_per_person);
  const rawTransitCost = Number(place?.transit?.cost);

  return {
    name: place?.name || '장소',
    type: place?.type || place?.cuisine || categoryConfigs[category].label,
    price_estimate: Number.isFinite(rawPriceEstimate) && rawPriceEstimate > 0 ? rawPriceEstimate : null,
    price_currency: place?.price_currency || 'KRW',
    price_level: place?.price_level || 'mid',
    rating_hint: place?.rating_hint || '',
    why: place?.why || '',
    tip: place?.tip || '',
    transit: {
      method: place?.transit?.method || '도보',
      duration_minutes: Number(place?.transit?.duration_minutes) || 0,
      cost: Number.isFinite(rawTransitCost) && rawTransitCost >= 0 ? rawTransitCost : 0,
      cost_currency: place?.transit?.cost_currency || 'KRW',
    },
  };
}

function normalizeRecommendationPayload(raw, category) {
  const placesSource = Array.isArray(raw?.places)
    ? raw.places
    : Array.isArray(raw?.restaurants)
      ? raw.restaurants
      : [];

  return {
    category,
    destination: raw?.destination || '현재 위치 주변',
    food_budget_total: Number(raw?.food_budget_total) || 0,
    currency: raw?.currency || 'KRW',
    reasoning: raw?.reasoning || '현재 위치와 예산을 기준으로 추천을 정리했어요.',
    places: placesSource.slice(0, 3).map((place) => normalizePlace(place, category)),
  };
}

function parseRecommendationContent(content, category) {
  const jsonText = extractJsonObject(content);
  const parsed = JSON.parse(jsonText);
  return normalizeRecommendationPayload(parsed, category);
}

async function requestRecommendation({
  apiKey,
  model,
  category,
  days,
  currency,
  foodBudgetTotal,
  coordinates,
}) {
  const categoryConfig = categoryConfigs[category];

  const userPrompt = `Task:
- Category: ${category}
- Category label: ${categoryConfig.label}
- Current coordinates: ${coordinates ? `${coordinates.lat}, ${coordinates.lng}` : 'unknown'}
- Travel duration: ${days} days
- Total available budget: ${foodBudgetTotal} ${currency}

Instructions:
- ${categoryConfig.prompt}
- Use the current coordinates to infer the surrounding area.
- Return exactly 3 places.
- Keep the recommendations within the user's total budget.
- For food, focus on meals/cafes.
- For shopping, focus on stores/markets/malls.
- For attraction, focus on landmarks, museums, parks, or viewpoints.`;

  const response = await fetch(`${GEMINI_API_BASE_URL}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  return { response, payload };
}

export async function fetchRecommendations({ category, days, currency, foodBudgetTotal, coordinates }) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const models = getConfiguredModels();

  if (!apiKey) {
    throw new Error('Gemini API 키가 없습니다. 프로젝트 루트의 .env 파일을 확인해주세요.');
  }

  let lastRateLimitHeader = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const { response, payload } = await requestRecommendation({
      apiKey,
      model,
      category,
      days,
      currency,
      foodBudgetTotal,
      coordinates,
    });

    if (response.ok) {
      const content = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof content !== 'string') {
        throw new Error('응답 파싱 오류. 다시 시도해주세요.');
      }

      return parseRecommendationContent(content, category);
    }

    if (response.status === 429) {
      lastRateLimitHeader = response.headers.get('retry-after');

      if (index === 0) {
        const retryAfterSeconds = Number(lastRateLimitHeader);
        const retryDelayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(retryAfterSeconds * 1000, MAX_RATE_LIMIT_RETRY_WAIT_MS)
          : 1200;

        await sleep(retryDelayMs);

        const retryAttempt = await requestRecommendation({
          apiKey,
          model,
          category,
          days,
          currency,
          foodBudgetTotal,
          coordinates,
        });

        if (retryAttempt.response.ok) {
          const content = retryAttempt.payload?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (typeof content !== 'string') {
            throw new Error('응답 파싱 오류. 다시 시도해주세요.');
          }

          return parseRecommendationContent(content, category);
        }

        if (retryAttempt.response.status !== 429) {
          throw new Error(
            retryAttempt.payload?.error?.message ||
              retryAttempt.payload?.message ||
              '추천 요청에 실패했습니다. Gemini API 키와 네트워크 상태를 확인해주세요.',
          );
        }

        lastRateLimitHeader = retryAttempt.response.headers.get('retry-after');
      }

      continue;
    }

    throw new Error(
      payload?.error?.message ||
        payload?.message ||
        '추천 요청에 실패했습니다. Gemini API 키와 네트워크 상태를 확인해주세요.',
    );
  }

  throw new Error(formatRateLimitMessage(lastRateLimitHeader));
}
