import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import http from "node:http";

const TARGET_URL = (process.env.TARGET_URL || "").replace(/\/$/, "");

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  if (!TARGET_URL) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    return res.end("Error: TARGET_URL environment variable is not set");
  }

  try {
    // delay خیلی کوچک برای جلوگیری از تشخیص
    await new Promise(r => setTimeout(r, Math.random() * 15 + 5));

    const targetUrl = TARGET_URL + req.url;

    const headers = {};
    const clientIp = req.headers["x-real-ip"] || req.headers["x-forwarded-for"];

    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase();
      if (["host", "connection", "upgrade", "x-railway"].includes(k)) continue;
      headers[k] = Array.isArray(value) ? value.join(", ") : value;
    }

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
  console.log(`✅ Relay server is running on port ${PORT}`);
});
