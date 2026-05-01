import http from "node:http";

const TARGET_URL = (process.env.TARGET_URL || "").replace(/\/$/, "");
const PORT = process.env.PORT || 3000;

console.log(`✅ Relay started on port ${PORT} | TARGET_URL = ${TARGET_URL || "NOT SET"}`);

const server = http.createServer(async (req, res) => {
  // تست ساده: اگر به ریشه بزنیم، پیام بده
  if (req.url === "/" || req.url === "") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end(`Railway Relay is Alive!\nTarget: ${TARGET_URL}\nTime: ${new Date().toISOString()}`);
  }

  if (!TARGET_URL) {
    res.writeHead(500);
    return res.end("TARGET_URL is not configured");
  }

  try {
    await new Promise(r => setTimeout(r, 10));

    const targetUrl = TARGET_URL + req.url;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: req.headers,
      redirect: "manual",
      duplex: "half"   // برای body
    });

    res.writeHead(upstream.status || 502);

    for (const [k, v] of upstream.headers) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      try { res.setHeader(k, v); } catch {}
    }

    if (upstream.body) {
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      res.end();
    }

  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Bad Gateway");
    }
  }
});

server.listen(PORT, "0.0.0.0");
