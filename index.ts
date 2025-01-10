import puppeteer from 'puppeteer';
import { setTimeout } from 'node:timers/promises';

(async () => {
  // Replace with your Instagram credentials
  const IG_USERNAME = 'b.h.u.m.i___';
  const IG_PASSWORD = '';

  // Which profile do we want to scrape?
  // You can use your own username if you want to see who you follow vs. who follows you.
  const TARGET_USERNAME = 'pointerunique';

  // Launch Puppeteer
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Set viewport and user agent for better compatibility
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/78.0.3904.108 Safari/537.36'
  );

  try {
    // 1) Go to Instagram login page
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle2',
    });

    // 2) Wait for the username/password fields
    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await page.waitForSelector('input[name="password"]', { timeout: 10000 });

    // 3) Type in credentials
    await page.type('input[name="username"]', IG_USERNAME, { delay: 100 });
    await page.type('input[name="password"]', IG_PASSWORD, { delay: 100 });

    // 4) Click the login button
    await page.click('button[type="submit"]');

    // 5) Wait for the main feed or 2FA checks
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // (Optional) Handle "Save Login Info?" or "Turn on Notifications?" popups
    // try {
    //   const notNowBtnSelector = 'button._acan._acap._acas:not([aria-label])';
    //   await page.waitForSelector(notNowBtnSelector, { timeout: 5000 });
    //   await page.click(notNowBtnSelector);
    //   await page.waitForTimeout(1000);
    // } catch (err) { /* if not found, ignore */ }

    // Helper function to scroll & scrape "followers" or "following"
    const scrapeList = async (listType) => {
      // Navigate to /followers or /following
      const url = `https://www.instagram.com/${TARGET_USERNAME}/${listType}`;
      console.log(`Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2' });

      // Wait for the dialog
      const modalSelector = 'div[role="dialog"]';
      await page.waitForSelector(modalSelector, { timeout: 10000 });

      // Scroll the list to load more
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
          // Break if we've tried enough times
          keepScrolling = false;
        }
        await setTimeout(2000);
      }

      // Extract usernames from the first container with
      // <div style="height: auto; overflow: hidden auto;">
      return await page.evaluate(() => {
        const container = document.querySelector(
          'div[style="height: auto; overflow: hidden auto;"]'
        );
        if (!container) {
          return [];
        }
        const spans = container.querySelectorAll(
          'span._ap3a._aaco._aacw._aacx._aad7._aade[dir="auto"]'
        );
        return Array.from(spans).map(span => span.innerText.trim());
      });
    };

    // 6) Scrape both lists
    const followerUsernames = await scrapeList('followers');
    const followingUsernames = await scrapeList('following');

    // 7) Determine who you follow that does NOT follow you back
    //    i.e. who is in "following" but not in "followers"?
    const followerSet = new Set(followerUsernames);
    const notInFollowers = followingUsernames.filter(
      (username) => !followerSet.has(username)
    );

    // 8) Log results
    console.log('---------------------');
    console.log('Followers:', followerUsernames);
    console.log('---------------------');
    console.log('Following:', followingUsernames);
    console.log('---------------------');
    console.log('Following but not followers:', notInFollowers);

  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    // Close the browser
    await browser.close();
  }
})();
