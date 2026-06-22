const { buildSajuProfile } = require("./lib/saju");

const SYSTEM_PROMPT = `당신은 한국 사주명리를 바탕으로 로또 6/45 번호를 추천하는 상담 챗봇입니다.
반드시 JSON만 출력하세요. 다른 텍스트는 금지합니다.

출력 스키마:
{
  "numbers": [6개의 서로 다른 정수, 1~45],
  "bonus": [1~45 정수, numbers에 없는 값],
  "summary": "한 문장 요약",
  "explanation": "사주 기반 추천 이유를 4~6문장으로 설명",
  "numberReasons": [
    { "number": 7, "reason": "해당 번호를 고른 사주적 근거 1문장" }
  ]
}

추천 철학 (가장 중요):
- 부족한 오행·결핍·보강·채운다는 논리로 번호를 고르지 마세요.
- profile.recommendationFocus, strengths, favorableElements, dayMaster, strong을 중심으로
  사주에서 이미 좋고 강한 기운(일간, 풍부한 오행, 일간을 돕는 오행, 조화로운 기둥)을 살려 번호를 고르세요.
- summary·explanation·numberReasons 모두 '강점·길한 기운을 살렸다'는 관점으로 작성하세요.
- lacking 필드가 있어도 언급하지 말고, 결핍 보충 표현을 쓰지 마세요.

규칙:
- numbers는 정확히 6개, 오름차순 정렬
- bonus는 numbers와 중복 불가
- numberReasons는 numbers 6개 + bonus 1개 모두 포함 (총 7개)
- 오행(목화토금수), 일간, favorableElements, strengths, 성별, 대운 방향을 근거로 설명
- 번호와 오행 연결은 1~45를 10주기(갑을병정...)와 12지(자축인...) 순환으로 해석
- 과장된 당첨 보장 표현 금지, 참고용 번호임을 명시
- 한국어로 작성`;

function buildUserPrompt(profile, message) {
  return [
    "사용자 사주 프로필:",
    JSON.stringify(profile, null, 2),
    "",
    message ? `사용자 추가 질문: ${message}` : "사용자 요청: 내 사주에서 좋고 강한 기운(일간·favorableElements·strengths)을 살려 로또 번호 6개와 보너스 1개를 추천해 주세요. 부족한 오행을 채우는 방식은 사용하지 마세요.",
  ].join("\n");
}

function validateRecommendation(data) {
  if (!data || typeof data !== "object") return "응답 형식 오류";
  if (!Array.isArray(data.numbers) || data.numbers.length !== 6) return "번호 6개 필요";
  if (new Set(data.numbers).size !== 6) return "번호 중복";
  if (!data.numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)) return "번호 범위 오류";
  if (!Number.isInteger(data.bonus) || data.bonus < 1 || data.bonus > 45) return "보너스 범위 오류";
  if (data.numbers.includes(data.bonus)) return "보너스 중복";
  return null;
}

async function callGemini(profile, message) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 Vercel 환경 변수에 설정되어 있지 않습니다.");
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(profile, message) }] }],
      generationConfig: {
        temperature: 0.85,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 오류 (${response.status}): ${errText.slice(0, 200)}`);
  }

  const payload = await response.json();
  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("AI 응답이 비어 있습니다.");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI JSON 파싱 실패");
  }

  parsed.numbers = [...parsed.numbers].sort((a, b) => a - b);
  const validationError = validateRecommendation(parsed);
  if (validationError) throw new Error(validationError);

  return parsed;
}

async function callOpenAI(profile, message) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 Vercel 환경 변수에 설정되어 있지 않습니다.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.85,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(profile, message) },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API 오류 (${response.status}): ${errText.slice(0, 200)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 응답이 비어 있습니다.");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI JSON 파싱 실패");
  }

  parsed.numbers = [...parsed.numbers].sort((a, b) => a - b);
  const validationError = validateRecommendation(parsed);
  if (validationError) throw new Error(validationError);

  return parsed;
}

async function callAI(profile, message) {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return callGemini(profile, message);
  }
  return callOpenAI(profile, message);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 지원합니다." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { gender, birthDate, message } = body || {};

    if (!gender || !birthDate) {
      return res.status(400).json({ error: "성별(gender)과 생년월일(birthDate)이 필요합니다." });
    }

    const profile = buildSajuProfile({ gender, birthDate });
    const recommendation = await callAI(profile, message);

    return res.status(200).json({
      profile,
      recommendation,
      reply: recommendation.explanation,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "사주 추천 처리 중 오류가 발생했습니다.",
    });
  }
};
