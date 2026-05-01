import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import http from "node:http";

const TARGET_URL = (process.env.TARGET_URL || "").replace(/\/$/, "");

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
];

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  if (!TARGET_URL) {
    res.writeHead(500);
    return res.end("Error: TARGET_URL environment variable is not set");
  }

  try {
    await sleep(Math.random() * 20 + 10);   // delay کوچک برای stealth

    const targetUrl = TARGET_URL + req.url;

    const headers = {};
    const clientIp = req.headers["x-real-ip"] || req.headers["x-forwarded-for"];

    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase();
      if (["host", "connection", "upgrade", "x-railway"].includes(k)) continue;
      headers[k] = Array.isArray(value) ? value.join(", ") : value;
    }

    headers["user-agent"] = randomUA();
    if (clientIp) headers["x-forwarded-for"] = clientIp;

    const method = req.method;
    const hasBody = !["GET", "HEAD"].includes(method);

    const fetchOpts = { 
      method, 
      headers, 
      redirect: "manual"
    };

    if (hasBody) {
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
      res.end("Bad Gateway");
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Relay server listening on port ${PORT}`);
});
