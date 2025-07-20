import { Container } from "@cloudflare/containers";
import { randomUUID } from "crypto";

export class BrowserContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "15s";

  override onStart() {
    console.log("Container successfully started");
  }

  override onStop() {
    console.log("Container successfully shut down");
  }

  override onError(error: unknown) {
    console.log("Container error:", error);
  }
}

type Env = {
  BROWSER_CONTAINER: DurableObjectNamespace<BrowserContainer>;
  API_KEY?: string;
  DEV?: string;
  DB: D1Database;
};

class BrowserRequestHandler {
  constructor(
    private env: Env,
    private request: Request,
    private url: URL,
  ) {}

  async handle(): Promise<Response> {
    const upgradeHeader = this.request.headers.get("Upgrade");
    const sessionId = this.extractSessionId();

    if (!sessionId && this.isJsonVersionRequest()) {
      // TODO Triple check that this logic is right that this is the only point we need authentication.
      const authResult = this.checkAuthentication();
      if (!authResult.isAuthenticated) {
        console.log(authResult);
        // Special handling for CDP discovery endpoint
        if (this.isJsonVersionRequest()) {
          return Response.json(
            {
              error: "Authentication required",
              message: authResult.message,
              instructions:
                "Add ?apiKey=YOUR_API_KEY to the URL or use Authorization header",
            },
            { status: 401 },
          );
        }
        return new Response(authResult.message, { status: 401 });
      }

      return this.handleJsonVersionRequest();
    }

    if (!sessionId) {
      return new Response("Session ID required", { status: 400 });
    }

    const container = await this.getContainer(sessionId);
    if (upgradeHeader === "websocket") {
      return this.handleWebsocketUpgrade(container, sessionId);
    }

    return this.containerFetchWithRewrite(container);
  }

  private extractSessionId(): string | null {
    return (
      this.request.headers.get("X-Session-ID") ||
      this.url.searchParams.get("sessionId")
    );
  }

  private isJsonVersionRequest(): boolean {
    return (
      this.url.pathname === "/json/version" ||
      this.url.pathname === "/json/version/"
    );
  }

  private async getContainer(
    sessionId: string,
  ): Promise<DurableObjectStub<BrowserContainer>> {
    return this.env.BROWSER_CONTAINER.get(
      this.env.BROWSER_CONTAINER.idFromName(sessionId),
    );
  }

  private rewriteHost(text: string): string {
    return text.replace(/127\.0\.0\.1:3000/g, this.url.host);
  }

  private async containerFetchWithRewrite(
    container: DurableObjectStub<BrowserContainer>,
  ): Promise<Response> {
    const upstream = `http://127.0.0.1:3000${this.url.pathname}${this.url.search}`;
    const resp = await container.containerFetch(upstream, this.request);
    const text = await resp.text();

    const fixed = this.rewriteHost(text);
    const headers = new Headers(resp.headers);
    headers.delete("content-length");

    return new Response(fixed, { status: resp.status, headers });
  }

  private async handleJsonVersionRequest(): Promise<Response> {
    const sessionId = randomUUID();

    // Get container directly by sessionId
    const container = this.env.BROWSER_CONTAINER.get(
      this.env.BROWSER_CONTAINER.idFromName(sessionId),
    );

    const upstream = `http://127.0.0.1:3000${this.url.pathname}${this.url.search}`;

    try {
      const resp = await container.containerFetch(upstream, this.request);

      // Check if response is JSON before parsing
      const contentType = resp.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        const text = await resp.text();
        console.error(`Non-JSON response from container: ${text}`);

        // Check if it's a container provisioning error
        if (
          text.includes("no Container instance available") ||
          text.includes("max concurrent instance count")
        ) {
          return new Response(
            JSON.stringify({
              error: "Too many concurrent browser sessions",
              message:
                "Maximum concurrent container limit reached. Please try again later.",
              details: text,
            }),
            {
              status: 429,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response(`Container initialization failed: ${text}`, {
          status: 500,
        });
      }

      const data = (await resp.json()) as any;

      if (data.webSocketDebuggerUrl) {
        const wsUrl = new URL(data.webSocketDebuggerUrl);
        wsUrl.searchParams.set("sessionId", sessionId);
        data.webSocketDebuggerUrl = this.rewriteHost(wsUrl.toString());
      }
      return Response.json(data);
    } catch (error) {
      console.error(`Error with container ${sessionId}:`, error);
      return new Response(`Failed to initialize browser container: ${error}`, {
        status: 500,
      });
    }
  }

  private async handleWebsocketUpgrade(
    container: DurableObjectStub<BrowserContainer>,
    sessionId: string,
  ): Promise<Response> {
    const newHeaders = new Headers(this.request.headers);
    newHeaders.set("X-Session-ID", sessionId);
    const newRequest = new Request(this.request.url, {
      method: this.request.method,
      headers: newHeaders,
      body: this.request.body,
    });

    return container.fetch(newRequest);
  }

  private checkAuthentication(): { isAuthenticated: boolean; message: string } {
    const isDev = this.env.DEV === "true";
    if (isDev) {
      return { isAuthenticated: true, message: "" };
    }

    // In production, API_KEY must be set
    if (!this.env.API_KEY) {
      return {
        isAuthenticated: false,
        message: "API_KEY not configured. See README.md for instructions.",
      };
    }

    // Check query parameter (useful for WebSocket connections)
    const apiKeyParam = this.url.searchParams.get("apiKey");
    if (apiKeyParam && apiKeyParam === this.env.API_KEY) {
      return { isAuthenticated: true, message: "" };
    }

    console.log({ apiKeyParam, API_KEY: this.env.API_KEY, url: this.url });
    return {
      isAuthenticated: false,
      message: "Invalid or missing API key. Use ?apiKey=YOUR_KEY",
    };
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const handler = new BrowserRequestHandler(env, request, url);
    return handler.handle();
  },
};
