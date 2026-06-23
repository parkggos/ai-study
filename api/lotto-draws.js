const { supabaseRequest } = require("./lib/supabase");

const DRAW_TYPES = new Set(["random", "analysis", "saju", "auto"]);
const MAX_LIMIT = 50;

function validateDrawPayload(body) {
  const numbers = body?.numbers;
  const bonus = body?.bonus;
  const drawType = body?.drawType || "random";

  if (!Array.isArray(numbers) || numbers.length !== 6) {
    return "당첨번호 6개가 필요합니다.";
  }
  if (new Set(numbers).size !== 6) {
    return "당첨번호는 중복될 수 없습니다.";
  }
  if (!numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)) {
    return "당첨번호는 1~45 범위의 정수여야 합니다.";
  }
  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) {
    return "보너스 번호는 1~45 범위의 정수여야 합니다.";
  }
  if (numbers.includes(bonus)) {
    return "보너스 번호는 당첨번호와 중복될 수 없습니다.";
  }
  if (!DRAW_TYPES.has(drawType)) {
    return "drawType 값이 올바르지 않습니다.";
  }

  return null;
}

function mapRow(row) {
  return {
    id: row.id,
    numbers: row.numbers,
    bonus: row.bonus,
    drawType: row.draw_type,
    createdAt: row.created_at,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method === "GET") {
      const limit = Math.min(
        MAX_LIMIT,
        Math.max(1, parseInt(req.query?.limit, 10) || MAX_LIMIT)
      );
      const rows = await supabaseRequest(
        "lotto_draws",
        {
          query: `?select=id,numbers,bonus,draw_type,created_at&order=created_at.desc&limit=${limit}`,
        }
      );

      return res.status(200).json({
        draws: Array.isArray(rows) ? rows.map(mapRow) : [],
      });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const error = validateDrawPayload(body);
      if (error) {
        return res.status(400).json({ error });
      }

      const sortedNumbers = [...body.numbers].map((n) => Number.parseInt(n, 10)).sort((a, b) => a - b);
      const bonus = Number.parseInt(body.bonus, 10);
      const errorAfterParse = validateDrawPayload({ numbers: sortedNumbers, bonus, drawType: body.drawType });
      if (errorAfterParse) {
        return res.status(400).json({ error: errorAfterParse });
      }

      const rows = await supabaseRequest("lotto_draws", {
        method: "POST",
        prefer: "return=representation",
        body: {
          numbers: sortedNumbers,
          bonus,
          draw_type: body.drawType || "random",
        },
      });

      const row = Array.isArray(rows) ? rows[0] : rows;
      return res.status(201).json({ draw: mapRow(row) });
    }

    return res.status(405).json({ error: "GET, POST만 지원합니다." });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "추첨 기록 처리 중 오류가 발생했습니다.",
    });
  }
};
