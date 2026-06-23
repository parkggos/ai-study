#!/usr/bin/env node
/**
 * 로컬 개발 서버 — 정적 파일 + /api/* 서버리스 함수
 * 사용법: node dev-server.js  (프로젝트 루트에서 실행)
 * 접속: http://localhost:3000/erp
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

const REWRITES = {
  "/": "/lotto/index.html",
  "/lotto": "/lotto/index.html",
  "/news": "/news/index.html",
  "/erp": "/erp/index.html",
  "/amongus-defense": "/amongus-defense/index.html",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function createResAdapter(res) {
  return {
    statusCode: 200,
    setHeader(k, v) {
      res.setHeader(k, v);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      res.statusCode = this.statusCode || 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify(data));
    },
    end(msg) {
      res.statusCode = this.statusCode || 200;
      res.end(msg);
    },
  };
}

async function handleApi(req, res, pathname) {
  const apiFile = path.join(ROOT, "api", pathname.replace(/^\/api\//, "") + ".js");
  if (!fs.existsSync(apiFile)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: `API를 찾을 수 없습니다: ${pathname}` }));
    return;
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end();
    return;
  }

  delete require.cache[require.resolve(apiFile)];
  const handler = require(apiFile);
  const body = await readBody(req);
  const mockReq = { method: req.method, body };
  const mockRes = createResAdapter(res);
  await handler(mockReq, mockRes);
}

function serveStatic(req, res, urlPath) {
  let filePath = REWRITES[urlPath] || urlPath;
  if (filePath.endsWith("/")) filePath += "index.html";
  const abs = path.join(ROOT, filePath);

  if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>");
    return;
  }

  const ext = path.extname(abs);
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  fs.createReadStream(abs).pipe(res);
}

loadEnv();

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const pathname = decodeURIComponent(url.pathname.replace(/\/+$/, "") || "/");

      if (pathname.startsWith("/api/")) {
        await handleApi(req, res, pathname);
        return;
      }

      serveStatic(req, res, pathname);
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: err.message || "서버 오류" }));
    }
  })
  .listen(PORT, () => {
    console.log(`Dev server: http://localhost:${PORT}/erp`);
    console.log(`API:        http://localhost:${PORT}/api/erp-report`);
    if (!process.env.GEMINI_API_KEY) {
      console.warn("⚠ GEMINI_API_KEY 없음 — .env 파일을 확인하세요.");
    }
  });
