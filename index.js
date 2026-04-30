import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const config = {
  api: { bodyParser: false },
  maxDuration: 120,        // Railway اجازه بیشتر می‌دهد
};

const TARGET_URL = (process.env.TARGET_URL || "").replace(/\/$/, "");

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
  "WordPress/6.6; https://example.com",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
];

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (!TARGET_URL) {
    res.statusCode = 500;
    return res.end("TARGET_URL environment variable is not set");
  }

  try {
    // شبیه‌سازی ترافیک معمولی
    await sleep(Math.random() * 30 + 10); // delay تصادفی 10 تا 40 میلی‌ثانیه

    const targetUrl = TARGET_URL + req.url;

    const headers = {};
    let clientIp = req.headers["x-real-ip"] || req.headers["x-forwarded-for"];

    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase();
      if (["host", "connection", "upgrade", "x-vercel", "x-railway"].includes(k)) continue;
      headers[k] = Array.isArray(value) ? value.join(", ") : value;
    }

    headers["user-agent"] = randomUA();
    if (clientIp) headers["x-forwarded-for"] = clientIp;

    const method = req.method;
    const hasBody = !["GET", "HEAD"].includes(method);

    const fetchOpts = {
      method,
      headers,
      redirect: "manual",
    };

    if (hasBody) {
      fetchOpts.body = Readable.toWeb(req);
      fetchOpts.duplex = "half";
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    res.statusCode = upstream.status || 502;

    for (const [k, v] of upstream.headers) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      try { res.setHeader(k, v); } catch (e) {}
    }

    if (upstream.body) {
      await pipeline(Readable.fromWeb(upstream.body), res);
    } else {
      res.end();
    }

  } catch (err) {
    console.error("Relay error:", err.message);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("Bad Gateway");
    }
  }
}