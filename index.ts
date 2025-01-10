import { serve } from "bun";
import puppeteer from "puppeteer";
import { setTimeout } from "node:timers/promises";

// A small helper function to scroll & scrape either "followers" or "following"
async function scrapeList(page, targetUsername, listType) {
  const url = `https://www.instagram.com/${targetUsername}/${listType}`;
  console.log(`Navigating to: ${url}`);
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

      const { scrollTop, scrollHeight, clientHeight } = container;
      container.scrollTop = scrollTop + 600; // scroll by a chunk

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

  // Extract usernames from the first container: <div style="height: auto; overflow: hidden auto;">
  return await page.evaluate(() => {
    const container = document.querySelector(
      'div[style="height: auto; overflow: hidden auto;"]'
    );
    if (!container) {
      return [];
    }
    // Each user is in <span class="_ap3a _aaco _aacw _aacx _aad7 _aade" dir="auto">
    const spans = container.querySelectorAll(
      'span._ap3a._aaco._aacw._aacx._aad7._aade[dir="auto"]'
    );
    return Array.from(spans).map((span) => span.innerText.trim());
  });
}

serve({
  port: 3000,
  async fetch(req) {
    // We expect a POST request with JSON body: 
    // {
    //   "IG_USERNAME": "...",
    //   "IG_PASSWORD": "...",
    //   "TARGET_USERNAME": "..."
    // }
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Use POST with JSON { IG_USERNAME, IG_PASSWORD, TARGET_USERNAME }" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch (err) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { IG_USERNAME, IG_PASSWORD, TARGET_USERNAME } = body || {};

    if (!IG_USERNAME || !IG_PASSWORD || !TARGET_USERNAME) {
      return new Response(
        JSON.stringify({ error: "Missing IG_USERNAME, IG_PASSWORD, or TARGET_USERNAME" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let browser;
    try {
      // Launch Puppeteer
      browser = await puppeteer.launch({
        headless: "new", // or true/false depending on your Puppeteer version
      });
      const page = await browser.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1366, height: 768 });
      await page.setUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/78.0.3904.108 Safari/537.36"
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
      // e.g., attempt to find a "Not Now" button, but skip if not found

      // 6) Scrape both lists for TARGET_USERNAME
      const followers = await scrapeList(page, TARGET_USERNAME, "followers");
      const following = await scrapeList(page, TARGET_USERNAME, "following");

      console.log("followers", followers);
      console.log("following", following);
      // 7) Determine: "Followers not Following" 
      // i.e. who is in followers but NOT in following
      const followersSet = new Set(followers);
      const dogle = following.filter(
        (username) => !followersSet.has(username)
      );

      // Return the result
      const result = {
        dogle, // "who follows me, but I do NOT follow them"
      };
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Error scraping:", err);
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
