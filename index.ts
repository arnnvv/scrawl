import puppeteer from "puppeteer";

(async () => {
  try {
    // Launch Puppeteer in headless mode
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Set viewport and user agent for better compatibility
    await page.setViewport({
      width: 1366,
      height: 768
    });
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36'
    );

    // Navigate to the specified Instagram profile
    await page.goto('https://www.instagram.com/therock', {
      waitUntil: 'networkidle2',
    });

    // Define the selector for the follower and following count spans
    const statsSelector = 'header section ul li';

    // Wait for the stats to load
    await page.waitForSelector(statsSelector, { timeout: 10000 });

    // Extract the number of followers and followings
    const { followersCount, followingsCount } = await page.evaluate(() => {
      const stats = document.querySelectorAll('header section ul li');
      let followers = 'N/A';
      let followings = 'N/A';

      if (stats.length >= 3) {
        // Assuming the order is: Posts, Followers, Following
        const followersElement = stats[1].querySelector('span span');
        const followingsElement = stats[2].querySelector('span span');

        if (followersElement) {
          // Followers count might be in the 'title' attribute or text content
          followers = followersElement.getAttribute('title') ||
                     followersElement.textContent;
          followers = followers.replace(/,/g, '').trim();
        }

        if (followingsElement) {
          followings = followingsElement.textContent.replace(/,/g, '').trim();
        }
      }

      return {
        followersCount: followers,
        followingsCount: followings,
      };
    });

    console.log(`Number of followers: ${followersCount}`);
    console.log(`Number of followings: ${followingsCount}`);

    // Close the browser
    await browser.close();
  } catch (error) {
    console.error('Error fetching followers count:', error);
  }
})();
