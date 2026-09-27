import http from "node:http";
import { Client } from "discord.js";

/**
 * Render (and most "free tier" hosts) only keep a *Web Service* alive if it
 * binds to $PORT and answers HTTP requests — otherwise it spins down after
 * ~15 minutes of inactivity. A Discord bot has no inbound HTTP traffic on
 * its own, so we run a tiny built-in server here purely as a health-check
 * endpoint. Point an external uptime pinger (UptimeRobot, cron-job.org,
 * Better Uptime, etc.) at this service's public URL every 5–10 minutes and
 * Render will treat that as traffic, keeping the bot process alive 24/7.
 *
 * This does NOT use Express or any extra dependency — Node's built-in
 * http module is enough for a single health-check route.
 */
export function startKeepAliveServer(client: Client): void {
  const port = Number(process.env.PORT) || 3000;

  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/health" || req.url === "/healthz") {
      const ready = client.isReady();
      res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: ready ? "ok" : "starting",
          botTag: client.user?.tag ?? null,
          guilds: ready ? client.guilds.cache.size : 0,
          uptimeSeconds: Math.floor(process.uptime()),
        })
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[keepalive] Health-check server listening on port ${port} (GET / or /health).`);
  });

  server.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[keepalive] Health-check server failed to start:", err);
  });
}
