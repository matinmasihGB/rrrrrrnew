import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import http from "node:http";
import https from "node:https";

const TARGET_URL = (process.env.TARGET_URL || "").replace(/\/$/, "");
const PORT = process.env.PORT || 3000;

console.log(`✅ Relay started on port ${PORT}`);
console.log(`Target: ${TARGET_URL}`);

const server = http.createServer(async (req, res) => {
  if (!TARGET_URL) {
    res.writeHead(500);
    return res.end("TARGET_URL is not set");
  }

  try {
    await new Promise(r => setTimeout(r, 8 + Math.random() * 12));

    const targetUrl = TARGET_URL + req.url;
    const isHttps = targetUrl.startsWith("https");

    const headers = {};
    const clientIp = req.headers["x-real-ip"] || req.headers["x-forwarded-for"];

    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase();
      if (["host", "connection", "upgrade", "x-railway"].includes(k)) continue;
      headers[k] = Array.isArray(value) ? value.join(", ") : value;
    }
    if (clientIp) headers["x-forwarded-for"] = clientIp;

    // تنظیمات fetch برای TLS
    const fetchOpts = {
      method: req.method,
      headers,
      redirect: "manual",
      agent: isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined   // برای تست TLS
    };

    if (!["GET", "HEAD"].includes(req.method)) {
      fetchOpts.body = Readable.toWeb(req);
      fetchOpts.duplex = "half";
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    res.writeHead(upstream.status || 502);

    for (const [k, v] of upstream.headers) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      try { res.setHeader(k, v); } catch {}
    }

    if (upstream.body) {
      await pipeline(Readable.fromWeb(upstream.body), res);
    } else {
      res.end();
    }

  } catch (err) {
    console.error("Relay Error:", err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Bad Gateway - TLS Error");
    }
  }
});

server.listen(PORT, "0.0.0.0");
