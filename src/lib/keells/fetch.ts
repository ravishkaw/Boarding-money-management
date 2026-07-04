import https from "node:https";

/**
 * Fetch the e-bill HTML with node:https instead of fetch(): the Keells CDN
 * (Cloudflare) 403s undici's fingerprint but accepts a plain https request
 * with browser-like headers.
 */
export function fetchBillHtml(
  url: URL,
  timeoutMs = 15000,
  redirectsLeft = 3,
): Promise<{ status: number; html: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (
          status >= 301 &&
          status <= 308 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          resolve(
            fetchBillHtml(
              new URL(res.headers.location, url),
              timeoutMs,
              redirectsLeft - 1,
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status, html: Buffer.concat(chunks).toString("utf8") }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}
