const SYSTEM_PROMPT = `당신은 전문 AI 뉴스 리포터입니다.
Google 검색을 활용해 키워드 관련 최근 7일 이내 주요 이슈를 수집하고, 한국어 보고서를 작성합니다.

반드시 아래 JSON 형식만 출력하세요. 다른 텍스트는 금지합니다.

{
  "title": "보고서 제목",
  "summary": "핵심 요약 2~3문장",
  "issues": [
    {
      "title": "이슈 제목",
      "description": "이슈 설명 2~4문장",
      "source": "출처명",
      "url": "https://..."
    }
  ],
  "trend": "트렌드 및 시사점 분석 3~5문장",
  "conclusion": "결론 1~2문장"
}

규칙:
- issues는 5~7개, 최근 7일 이내 뉴스만 포함
- 각 이슈에 실제 출처 URL 포함 (검색 결과 기반)
- 객관적·사실 중심으로 작성, 추측은 명시
- 한국어로 작성`;

function buildUserPrompt(keyword) {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const fmt = (d) =>
    d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  return [
    `키워드: "${keyword}"`,
    `오늘: ${fmt(today)}`,
    `검색 기간: ${fmt(weekAgo)} ~ ${fmt(today)} (최근 7일)`,
    "",
    `"${keyword}"와 관련된 최근 7일 이내 국내외 주요 뉴스·이슈를 검색하여 보고서를 작성해 주세요.`,
    "정치, 경제, 기술, 산업 등 해당 키워드와 직접 관련된 이슈를 우선 포함하세요.",
  ].join("\n");
}

function extractSources(groundingMetadata) {
  if (!groundingMetadata?.groundingChunks) return [];

  const seen = new Set();
  const sources = [];

  for (const chunk of groundingMetadata.groundingChunks) {
    const web = chunk.web;
    if (!web?.uri || seen.has(web.uri)) continue;
    seen.add(web.uri);
    sources.push({ title: web.title || web.uri, url: web.uri });
  }

  return sources;
}

async function callGeminiWithSearch(keyword) {
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
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(keyword) }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 오류 (${response.status}): ${errText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const candidate = payload.candidates?.[0];
  const content = candidate?.content?.parts?.[0]?.text;
  if (!content) throw new Error("AI 응답이 비어 있습니다.");

  let report;
  try {
    report = JSON.parse(content);
  } catch {
    throw new Error("AI JSON 파싱 실패");
  }

  const sources = extractSources(candidate.groundingMetadata);

  return { report, sources, searchEntryPoint: candidate.groundingMetadata?.searchEntryPoint };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(keyword, report, sources) {
  const issuesHtml = (report.issues || [])
    .map(
      (issue, i) => `
      <div style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #e5e7eb;">
        <h3 style="margin:0 0 8px;font-size:16px;color:#111827;">${i + 1}. ${escapeHtml(issue.title)}</h3>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(issue.description)}</p>
        ${
          issue.url
            ? `<a href="${escapeHtml(issue.url)}" style="font-size:13px;color:#2563eb;">${escapeHtml(issue.source || issue.url)}</a>`
            : ""
        }
      </div>`
    )
    .join("");

  const sourcesHtml =
    sources.length > 0
      ? `<h2 style="font-size:18px;color:#111827;margin:32px 0 16px;">참고 출처</h2>
         <ul style="margin:0;padding-left:20px;">
           ${sources.map((s) => `<li style="margin-bottom:6px;"><a href="${escapeHtml(s.url)}" style="color:#2563eb;font-size:13px;">${escapeHtml(s.title)}</a></li>`).join("")}
         </ul>`
      : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:32px 24px;color:#111827;">
  <div style="border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:24px;">
    <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">AI News Reporter</p>
    <h1 style="margin:0;font-size:24px;">${escapeHtml(report.title || `"${keyword}" 주간 이슈 보고서`)}</h1>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">생성일: ${new Date().toLocaleDateString("ko-KR")}</p>
  </div>
  <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin-bottom:24px;">
    <h2 style="margin:0 0 8px;font-size:14px;color:#6b7280;">요약</h2>
    <p style="margin:0;font-size:15px;line-height:1.6;">${escapeHtml(report.summary)}</p>
  </div>
  <h2 style="font-size:18px;color:#111827;margin:0 0 16px;">주요 이슈</h2>
  ${issuesHtml}
  <h2 style="font-size:18px;color:#111827;margin:24px 0 12px;">트렌드 분석</h2>
  <p style="font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(report.trend)}</p>
  <h2 style="font-size:18px;color:#111827;margin:24px 0 12px;">결론</h2>
  <p style="font-size:14px;line-height:1.7;color:#374151;">${escapeHtml(report.conclusion)}</p>
  ${sourcesHtml}
  <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
    Powered by Gemini (Google Search Grounding) · Resend
  </p>
</body>
</html>`;
}

async function sendEmail(to, keyword, report, sources) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: "RESEND_API_KEY가 설정되지 않았습니다." };
  }

  const from = process.env.RESEND_FROM_EMAIL || "AI News Reporter <onboarding@resend.dev>";
  const subject = `[AI News Reporter] ${keyword} — 주간 이슈 보고서`;
  const html = buildEmailHtml(keyword, report, sources);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || payload.error || `이메일 발송 실패 (${response.status})`);
  }

  return { sent: true, id: payload.id };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    const { keyword, email } = body || {};

    const trimmedKeyword = (keyword || "").trim();
    const trimmedEmail = (email || "").trim();

    if (!trimmedKeyword) {
      return res.status(400).json({ error: "키워드를 입력해 주세요." });
    }
    if (!trimmedEmail) {
      return res.status(400).json({ error: "이메일 주소를 입력해 주세요." });
    }
    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." });
    }

    const { report, sources, searchEntryPoint } = await callGeminiWithSearch(trimmedKeyword);
    const emailResult = await sendEmail(trimmedEmail, trimmedKeyword, report, sources);

    return res.status(200).json({
      report,
      sources,
      searchEntryPoint,
      email: emailResult,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "보고서 생성 중 오류가 발생했습니다.",
    });
  }
};
