function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 Vercel 환경 변수에 설정되어 있지 않습니다.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseRequest(table, { method = "GET", query = "", body, prefer } = {}) {
  const { url, key } = getSupabaseConfig();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${url}/rest/v1/${table}${query}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data?.message
        ? data.message
        : typeof data === "string"
          ? data.slice(0, 200)
          : `Supabase 오류 (${response.status})`;
    throw new Error(message);
  }

  return data;
}

module.exports = { supabaseRequest };
