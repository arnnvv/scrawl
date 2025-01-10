import puppeteer from 'puppeteer';
import { setTimeout } from 'node:timers/promises';

(async () => {
  // Replace with your Instagram credentials
  const IG_USERNAME = 'b.h.u.m.i___';
  const IG_PASSWORD = '';

  // Launch Puppeteer
  const browser = await puppeteer.launch({ headless: false }); 
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

    // 5) Wait for navigation/2FA prompts
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // (Optional) Handle "Save Login Info?" or "Turn on Notifications?" dialogs
    // For example:
    // try {
    //   const notNowBtnSelector = 'button._acan._acap._acas:not([aria-label])';
    //   await page.waitForSelector(notNowBtnSelector, { timeout: 5000 });
    //   await page.click(notNowBtnSelector);
    //   await page.waitForTimeout(1000);
    // } catch (err) { /* no pop-up appeared */ }

    // 6) Navigate to the follower list you want to scrape
    await page.goto('https://www.instagram.com/pointerunique/followers', {
      waitUntil: 'networkidle2',
    });

    // 7) Wait for the dialog that contains the followers
    const modalSelector = 'div[role="dialog"]';
    await page.waitForSelector(modalSelector, { timeout: 10000 });

    // 8) Scroll the followers list to load more followers
    //    Typically, the second child is the scrollable container for the follower list
    const followersScrollContainerSelector = `${modalSelector} div:nth-child(2)`;
    let keepScrolling = true;
    let scrollAttempts = 0;

    while (keepScrolling) {
      keepScrolling = await page.evaluate((selector) => {
        const scrollContainer = document.querySelector(selector);
        if (!scrollContainer) return false;
        
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        scrollContainer.scrollTop = scrollTop + 600; // scroll by a chunk

        // If we've basically reached the bottom, stop
        return scrollHeight - scrollTop > clientHeight + 5;
      }, followersScrollContainerSelector);

      scrollAttempts++;
      if (scrollAttempts > 50) {
        // Avoid infinite loops if something goes wrong
        keepScrolling = false;
      }
      await setTimeout(2000);
    }

    // 9) Now, select ONLY the first div (the one with "height: auto; overflow: hidden auto;")
    //    and scrape the spans that contain the follower usernames.
    const followerUsernames = await page.evaluate(() => {
      // The container with the inline style
      const firstContainer = document.querySelector(
        'div[style="height: auto; overflow: hidden auto;"]'
      );
      if (!firstContainer) {
        return [];
      }

      // Within this container, find the <span> elements for usernames
      // Classes: _ap3a _aaco _aacw _aacx _aad7 _aade and dir="auto"
      const spans = firstContainer.querySelectorAll(
        'span._ap3a._aaco._aacw._aacx._aad7._aade[dir="auto"]'
      );
      return Array.from(spans).map((span) => span.innerText.trim());
    });

    console.log('Actual follower usernames:', followerUsernames);

  } catch (err) {
    console.error('Error scraping followers:', err);
  } finally {
    // Close the browser
    await browser.close();
  }
})();
