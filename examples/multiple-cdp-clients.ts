import playwright from "playwright";

interface ClientConfig {
  id: number;
  url: string;
  delayMs?: number;
  targetSite?: string;
}

async function connectClient(config: ClientConfig) {
  const startTime = Date.now();
  console.log(`[Client ${config.id}] Starting connection to ${config.url}`);

  try {
    if (config.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, config.delayMs));
    }

    const browser = await playwright["chromium"].connectOverCDP(config.url);
    console.log(
      `[Client ${config.id}] Connected successfully (${Date.now() - startTime}ms)`,
    );

    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`[Client ${config.id}] Creating new page and navigating...`);
    await page.goto("https://www.example.com");

    const title = await page.title();
    console.log(`[Client ${config.id}] Page title: ${title}`);

    // Keep connection alive for testing
    console.log(`[Client ${config.id}] Keeping connection alive...`);

    // Simulate some activity
    setInterval(async () => {
      try {
        const url = page.url();
        console.log(`[Client ${config.id}] Still active at ${url}`);
      } catch (error) {
        console.error(`[Client ${config.id}] Connection lost:`, error.message);
      }
    }, 5000);
  } catch (error) {
    console.error(`[Client ${config.id}] Failed to connect:`, error.message);
  }
}

async function main() {
  const baseUrl = process.argv[2] ?? "http://localhost:8787";
  const clientCount = parseInt(process.argv[3] ?? "5");

  console.log(`Starting ${clientCount} CDP clients connecting to ${baseUrl}`);

  const clients: Promise<void>[] = [];

  for (let i = 0; i < clientCount; i++) {
    const config: ClientConfig = {
      id: i + 1,
      url: baseUrl,
    };

    clients.push(connectClient(config));
  }

  // Wait for all clients to connect
  await Promise.all(clients);

  console.log("\nAll clients connected. Press Ctrl+C to exit.");

  // Keep the process running
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
