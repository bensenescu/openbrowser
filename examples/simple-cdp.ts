import playwright from "playwright";

async function main() {
  console.log("Connecting to CDP...");
  const url = process.argv[2] ?? "http://localhost:8787";
  const browser = await playwright["chromium"].connectOverCDP(url);

  console.log("Connected to CDP");

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to Google...");
  await page.goto("https://www.google.com");

  const title = await page.title();
  console.log("Page title:", title);

  // await browser.close();
}

main().then(() => process.exit(0));
