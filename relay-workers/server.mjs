import { createServer } from "node:http";
import relay from "./hayha-success.js";

const port = Number(process.env.PORT || 8788);

const server = createServer((incoming, outgoing) => {
  void handle(incoming, outgoing);
});

async function handle(incoming, outgoing) {
  try {
    const method = incoming.method || "GET";
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) {
        value.forEach((entry) => headers.append(name, entry));
      } else if (value !== undefined) {
        headers.set(name, value);
      }
    }

    const chunks = [];
    if (method !== "GET" && method !== "HEAD") {
      for await (const chunk of incoming) {
        chunks.push(chunk);
      }
    }
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const host = incoming.headers.host || `localhost:${port}`;
    const request = new Request(`http://${host}${incoming.url || "/"}`, {
      method,
      headers,
      ...(body ? { body } : {}),
    });
    const response = await relay.fetch(request, process.env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("Relay request failed", error);
    outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end("Relay request failed");
  }
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Success relay listening on port ${port}`);
});