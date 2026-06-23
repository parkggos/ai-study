const { supabaseRequest } = require("./lib/supabase");
const { formatKstDateTime, normalizeKstDbValue } = require("./lib/kst");

const DRAW_TYPES = new Set(["random", "analysis", "saju", "auto"]);
const CHAT_TYPES = new Set(["user", "bot", "error"]);
const MAX_LIMIT = 50;
const MAX_CHAT_LOG = 40;
const MAX_CHAT_TEXT = 4000;

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

function validateChatLog(chatLog) {
  if (chatLog == null) return null;
  if (!Array.isArray(chatLog)) return "chatLog는 배열이어야 합니다.";
  if (chatLog.length > MAX_CHAT_LOG) return "chatLog가 너무 깁니다.";

  for (const item of chatLog) {
    if (!item || typeof item !== "object") return "chatLog 형식이 올바르지 않습니다.";
    if (!CHAT_TYPES.has(item.type)) return "chatLog type 값이 올바르지 않습니다.";
    if (typeof item.text !== "string" || !item.text.trim()) return "chatLog text가 비어 있습니다.";
    if (item.text.length > MAX_CHAT_TEXT) return "chatLog text가 너무 깁니다.";
  }

  return null;
}

function sanitizeChatLog(chatLog) {
  if (!Array.isArray(chatLog) || chatLog.length === 0) return null;
  return chatLog.map((item) => ({
    type: item.type,
    text: item.text.trim(),
  }));
}

function mapRow(row) {
  return {
    id: row.id,
    numbers: row.numbers,
    bonus: row.bonus,
    drawType: row.draw_type,
    createdAt: normalizeKstDbValue(row.created_at),
    chatLog: row.chat_log || null,
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
      const rows = await supabaseRequest("lotto_draws", {
        query: `?select=id,numbers,bonus,draw_type,created_at,chat_log&order=created_at.desc&limit=${limit}`,
      });

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

      const chatLogError = validateChatLog(body.chatLog);
      if (chatLogError) {
        return res.status(400).json({ error: chatLogError });
      }

      const sortedNumbers = [...body.numbers].map((n) => Number.parseInt(n, 10)).sort((a, b) => a - b);
      const bonus = Number.parseInt(body.bonus, 10);
      const errorAfterParse = validateDrawPayload({ numbers: sortedNumbers, bonus, drawType: body.drawType });
      if (errorAfterParse) {
        return res.status(400).json({ error: errorAfterParse });
      }

      const chatLog = sanitizeChatLog(body.chatLog);
      const insertBody = {
        numbers: sortedNumbers,
        bonus,
        draw_type: body.drawType || "random",
        created_at: formatKstDateTime(),
      };
      if (chatLog) insertBody.chat_log = chatLog;

      const rows = await supabaseRequest("lotto_draws", {
        method: "POST",
        prefer: "return=representation",
        body: insertBody,
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
