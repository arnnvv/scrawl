import { serve } from "bun";
import puppeteer, { Browser, Page } from "puppeteer";
import { setTimeout } from "node:timers/promises";

/** 
 * The expected shape of the POST body.
 */
interface InstagramRequestBody {
  IG_USERNAME: string;
  IG_PASSWORD: string;
  TARGET_USERNAME: string;
}

/**
 * A small helper function to scroll & scrape either "followers" or "following".
 * @param page Puppeteer Page instance
 * @param targetUsername The Instagram username whose list we are scraping
 * @param listType Either "followers" or "following"
 * @returns A Promise resolving to an array of scraped usernames (strings)
 */
async function scrapeList(
  page: Page,
  targetUsername: string,
  listType: "followers" | "following"
): Promise<string[]> {
  const url = `https://www.instagram.com/${targetUsername}/${listType}`;

  await page.goto(url, { waitUntil: "networkidle2" });

  // Wait for the dialog containing the list
  const modalSelector = 'div[role="dialog"]';
  await page.waitForSelector(modalSelector, { timeout: 10000 });

  // Scroll the modal container to load more items
  const scrollContainerSelector = `${modalSelector} div:nth-child(2)`;
  let keepScrolling = true;
  let scrollAttempts = 0;

  while (keepScrolling) {
    keepScrolling = await page.evaluate((selector) => {
      const container = document.querySelector(selector);
      if (!container) return false;

      const { scrollTop, scrollHeight, clientHeight } = container as HTMLElement;
      (container as HTMLElement).scrollTop = scrollTop + 600; // scroll by a chunk

      // If we've basically reached the bottom, stop
      return scrollHeight - scrollTop > clientHeight + 5;
    }, scrollContainerSelector);

    scrollAttempts++;
    if (scrollAttempts > 50) {
      // Avoid infinite loops if something goes wrong
      keepScrolling = false;
    }
    // Wait a bit before scrolling again
    await setTimeout(1500);
  }

  // Extract usernames from the first container: 
  // <div style="height: auto; overflow: hidden auto;">
  return await page.evaluate(() => {
    const container = document.querySelector(
      'div[style="height: auto; overflow: hidden auto;"]'
    );
    if (!container) {
      return [] as string[];
    }
    // Each user is in:
    // <span class="_ap3a _aaco _aacw _aacx _aad7 _aade" dir="auto">
    const spans = container.querySelectorAll(
      'span._ap3a._aaco._aacw._aacx._aad7._aade[dir="auto"]'
    );
    return Array.from(spans).map((span) => (span as HTMLElement).innerText.trim());
  });
}

/**
 * Bun's HTTP server on port 3000.
 */
serve({
  port: 3000,
  async fetch(req: Request): Promise<Response> {
    // POST request with JSON body:
    // {
    //   "IG_USERNAME": "...",
    //   "IG_PASSWORD": "...",
    //   "TARGET_USERNAME": "..."
    // }
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          error:
            'Use POST with JSON { IG_USERNAME, IG_PASSWORD, TARGET_USERNAME }',
        }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    let body: InstagramRequestBody;
    try {
      body = (await req.json()) as InstagramRequestBody;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { IG_USERNAME, IG_PASSWORD, TARGET_USERNAME } = body || {};

    if (!IG_USERNAME || !IG_PASSWORD || !TARGET_USERNAME) {
      return new Response(
        JSON.stringify({
          error: "Missing IG_USERNAME, IG_PASSWORD, or TARGET_USERNAME",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let browser: Browser | undefined;
    try {
      // Launch Puppeteer
      browser = await puppeteer.launch({
        headless: "new", // or true/false depending on your Puppeteer version
      });
      const page: Page = await browser.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1366, height: 768 });
      await page.setUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36"
      );

      // 1) Go to Instagram login page
      await page.goto("https://www.instagram.com/accounts/login/", {
        waitUntil: "networkidle2",
      });

      // 2) Wait for the username/password fields
      await page.waitForSelector('input[name="username"]', { timeout: 10000 });
      await page.waitForSelector('input[name="password"]', { timeout: 10000 });

      // 3) Type in credentials
      await page.type('input[name="username"]', IG_USERNAME, { delay: 80 });
      await page.type('input[name="password"]', IG_PASSWORD, { delay: 80 });

      // 4) Click the login button
      await page.click('button[type="submit"]');

      // 5) Wait for main feed or 2FA checks
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      // (Optional) Handle "Save Login Info?" or "Turn on Notifications?" pop-ups

      // 6) Scrape both lists for TARGET_USERNAME
      const followers: string[] = await scrapeList(page, TARGET_USERNAME, "followers");
      const following: string[] = await scrapeList(page, TARGET_USERNAME, "following");

      // 7) Determine: "Followers not in Following"
      // i.e. who is in followers but NOT in following
      const followersSet = new Set(followers);
      const dogle: string[] = following.filter(
        (username) => !followersSet.has(username)
      );

      // Return the result
      const result: {
        dogle: string[]; // "who is in following but NOT in followers"
      } = {
        dogle,
      };
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  },
});
