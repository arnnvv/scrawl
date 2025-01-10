import puppeteer from 'puppeteer';
import { setTimeout } from "node:timers/promises";

(async () => {
  // Replace with your Instagram credentials
  const IG_USERNAME = 'b.h.u.m.i___';
  const IG_PASSWORD = '';

  // Launch Puppeteer
  const browser = await puppeteer.launch({ headless: false }); // headless: false for debugging
  const page = await browser.newPage();

  // Set viewport and user agent for better compatibility
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36'
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

    // 5) Wait for navigation to finish (or 2FA prompts, if any)
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // OPTIONAL: Handle "Save Your Login Info?" or "Turn on Notifications?" pop-up
    // Example:
    // try {
    //   const notNowButtonSelector = 'button._acan._acap._acas:not([aria-label])';
    //   await page.waitForSelector(notNowButtonSelector, { timeout: 5000 });
    //   await page.click(notNowButtonSelector);
    //   await page.waitForTimeout(1000); 
    // } catch (err) {
    //   // If not found, ignore
    // }

    // 6) Navigate to your target profile’s followers list
    //    Replace pointerunique with the username you want to scrape
    await page.goto('https://www.instagram.com/pointerunique/followers', {
      waitUntil: 'networkidle2',
    });

    // 7) Wait for the dialog containing followers
    const modalSelector = 'div[role="dialog"]';
    await page.waitForSelector(modalSelector, { timeout: 10000 });

    // 8) Scroll the followers list to load more
    const followersScrollContainerSelector = `${modalSelector} div:nth-child(2)`;
    let keepScrolling = true;
    let scrollAttempts = 0;
    while (keepScrolling) {
      keepScrolling = await page.evaluate((selector) => {
        const scrollContainer = document.querySelector(selector);
        if (!scrollContainer) return false;

        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        scrollContainer.scrollTop = scrollTop + 600; // scroll by a chunk
        return scrollHeight - scrollTop > clientHeight + 5;
      }, followersScrollContainerSelector);

      scrollAttempts++;
      // Break after too many attempts to avoid infinite loop
      if (scrollAttempts > 50) {
        keepScrolling = false;
      }

      await setTimeout(2000);
    }

    // 9) Collect usernames
    // The updated selector for the span tags:
    const followerUsernames = await page.evaluate(() => {
      // Because the classes have spaces, we must use .class1.class2.class3 for each class
      const spans = document.querySelectorAll(
        'span._ap3a._aaco._aacw._aacx._aad7._aade[dir="auto"]'
      );
      const usernames = [];
      spans.forEach((span) => {
        const username = span.innerText.trim();
        if (username) {
          usernames.push(username);
        }
      });
      return usernames;
    });

    // 10) Log the results
    console.log('Follower usernames:', followerUsernames);

  } catch (err) {
    console.error('Something went wrong:', err);
  } finally {
    // Close the browser
    await browser.close();
  }
})();
