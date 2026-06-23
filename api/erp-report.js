const SYSTEM_PROMPT = `당신은 ERP 데이터 분석 및 경영 컨설팅 전문가입니다.
제공된 매출·주문·고객·상품 데이터와 KPI 상태를 바탕으로 경영진용 분석 보고서를 작성합니다.

반드시 아래 JSON 형식만 출력하세요. 다른 텍스트는 금지합니다.

{
  "title": "보고서 제목",
  "executiveSummary": "경영 요약 3~5문장",
  "sections": [
    {
      "heading": "섹션 제목",
      "content": "상세 분석 본문 (2~4문단, 문단 구분은 \\n\\n)"
    }
  ],
  "keyFindings": ["핵심 발견 사항"],
  "recommendations": ["개선 제안"],
  "riskAlerts": ["주의·리스크 알림"]
}

규칙:
- sections는 4~6개 (매출 현황, 수익성, 채널·결제, 고객 세그먼트, 재고·상품, 종합 전망 등)
- 제공된 수치를 구체적으로 인용하고, KPI 상태(정상/주의/심각)를 분석에 반영
- keyFindings 4~6개, recommendations 3~5개, riskAlerts 2~4개
- 데이터에 없는 내용은 추측하지 말고, 추론 시 "추정" 또는 "가능성"으로 명시
- 한국어, 전문적이고 명확한 문체`;

function parseJsonFromText(text) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    return JSON.parse(codeBlock[1].trim());
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return JSON.parse(objectMatch[0]);
  }

  throw new Error("AI JSON 파싱 실패");
}

function formatMoneyKRW(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return String(val);
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}

function buildUserPrompt(payload) {
  const lines = [
    "다음 ERP 데이터를 분석하여 경영진용 보고서를 작성해 주세요.",
    "",
    `보고서 기준일: ${payload.generatedAt || new Date().toISOString().slice(0, 10)}`,
    `분석 기간: ${payload.period?.from || "미상"} ~ ${payload.period?.to || "미상"}`,
    "",
    "=== KPI 지표 및 상태 ===",
  ];

  for (const [name, item] of Object.entries(payload.kpi || {})) {
    const status = item.status ? ` [${item.status}]` : "";
    lines.push(`- ${name}: ${item.display}${status}`);
  }

  if (payload.monthlySales?.length) {
    lines.push("", "=== 월별 매출 추이 ===");
    for (const row of payload.monthlySales) {
      lines.push(`- ${row.month}: ${formatMoneyKRW(row.sales)}`);
    }
  }

  if (payload.categorySales?.length) {
    lines.push("", "=== 카테고리별 매출 TOP ===");
    for (const [cat, sales] of payload.categorySales) {
      lines.push(`- ${cat}: ${formatMoneyKRW(sales)}`);
    }
  }

  if (payload.channelSales?.length) {
    lines.push("", "=== 채널별 매출 ===");
    for (const [ch, sales] of payload.channelSales) {
      lines.push(`- ${ch}: ${formatMoneyKRW(sales)}`);
    }
  }

  if (payload.paymentSales?.length) {
    lines.push("", "=== 결제수단별 매출 ===");
    for (const [method, sales] of payload.paymentSales) {
      lines.push(`- ${method}: ${formatMoneyKRW(sales)}`);
    }
  }

  if (payload.tierSales?.length) {
    lines.push("", "=== 고객 등급별 매출 ===");
    for (const [tier, sales] of payload.tierSales) {
      lines.push(`- ${tier}: ${formatMoneyKRW(sales)}`);
    }
  }

  if (payload.orderStatus?.length) {
    lines.push("", "=== 주문 상태 분포 ===");
    for (const [status, count] of payload.orderStatus) {
      lines.push(`- ${status}: ${count}건`);
    }
  }

  if (payload.topProducts?.length) {
    lines.push("", "=== 상품 매출 TOP ===");
    for (const p of payload.topProducts) {
      lines.push(`- ${p.name}: ${formatMoneyKRW(p.sales)} (수량 ${p.qty}개)`);
    }
  }

  if (payload.topCustomers?.length) {
    lines.push("", "=== 고객 매출 TOP ===");
    for (const c of payload.topCustomers) {
      lines.push(`- ${c.name} (${c.tier}/${c.city}): ${formatMoneyKRW(c.sales)}`);
    }
  }

  if (payload.stockRisk?.length) {
    lines.push("", "=== 재고 위험 품목 (일부) ===");
    for (const s of payload.stockRisk) {
      lines.push(`- ${s.name}: 재고 ${s.qty}개`);
    }
  }

  lines.push(
    "",
    "=== 데이터 규모 ===",
    `- 주문: ${payload.dataScale?.orders ?? 0}건`,
    `- 주문상세: ${payload.dataScale?.orderItems ?? 0}건`,
    `- 상품: ${payload.dataScale?.products ?? 0}개`,
    `- 고객: ${payload.dataScale?.customers ?? 0}명`
  );

  return lines.join("\n");
}

async function callGemini(payload) {
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
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(payload) }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 오류 (${response.status}): ${errText.slice(0, 300)}`);
  }

  const result = await response.json();
  const content = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("AI 응답이 비어 있습니다.");

  return parseJsonFromText(content);
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
    const payload = body?.payload;

    if (!payload || !payload.kpi) {
      return res.status(400).json({ error: "분석할 ERP 데이터가 없습니다." });
    }

    const report = await callGemini(payload);

    return res.status(200).json({
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "보고서 생성 중 오류가 발생했습니다.",
    });
  }
};
