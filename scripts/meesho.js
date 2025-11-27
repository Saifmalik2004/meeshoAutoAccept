require("dotenv").config();
const { chromium } = require("playwright");

const TIMEOUT = 60_000;

async function safeClick(page, locator, what) {
  try {
    await locator.waitFor({ state: "visible", timeout: TIMEOUT });
    await locator.click();
    console.log(`✅ Clicked: ${what}`);
  } catch (e) {
    console.error(`❌ Failed to click: ${what}`);
    console.error(e);
    throw e;
  }
}

async function safeCheck(page, locator, what) {
  try {
    await locator.waitFor({ state: "visible", timeout: TIMEOUT });

    const alreadyChecked = await locator.isChecked().catch(() => false);
    if (alreadyChecked) {
      console.log(`ℹ️ ${what} already checked, skipping.`);
      return;
    }

    try {
      await locator.check({ force: true });
      console.log(`✅ Checked (via .check): ${what}`);
    } catch (e) {
      console.warn(`⚠️ .check failed for ${what}, trying .click...`, e);
      await locator.click({ force: true });
      console.log(`✅ Clicked (fallback) checkbox for: ${what}`);
    }
  } catch (e) {
    console.error(`❌ Failed to check: ${what}`);
    console.error(e);
    throw e;
  }
}


async function dismissPopups(page, context = "") {
  console.log(`🧹 Trying to dismiss popups ${context ? "(" + context + ")" : ""}...`);

  try {
    // Popup ko render hone ka thoda time
    await page.waitForTimeout(1500);

    // 1) Skip wala overlay (span "Skip" inside div.css-gq3nwx)
    const skipSpan = page.locator('span.MuiTypography-button:has-text("Skip")').first();

    if (await skipSpan.count()) {
      console.log("🔎 Found Skip span for popup");

      // uska parent clickable div (css-gq3nwx) try karte hain
      const skipContainer = skipSpan.locator('xpath=ancestor::div[contains(@class,"css-gq3nwx")]').first();
      const target = (await skipContainer.count()) ? skipContainer : skipSpan;

      await safeClick(page, target, "Skip popup area");
      console.log("✅ Dismissed popup via Skip area");
      return;
    }

    // 2) X icon (close) svg with class css-1fmevri
    const closeSvg = page.locator("svg.css-1fmevri").first();
    if (await closeSvg.count()) {
      console.log("🔎 Found X close svg (css-1fmevri)");
      await closeSvg.waitFor({ state: "visible", timeout: TIMEOUT });
      await closeSvg.click({ force: true });
      console.log("✅ Closed popup via X svg");
      return;
    }

    // 3) Got it (e.g. "Accepted 3 orders – Got it")
    const gotItBtn = page.getByRole("button", { name: /got it/i });
    if (await gotItBtn.count()) {
      await safeClick(page, gotItBtn.first(), "Got it button");
      console.log("✅ Dismissed popup via Got it");
      return;
    }

    console.log("ℹ️ No known popup/dialog detected.");
  } catch (e) {
    console.warn("⚠️ dismissPopups had an issue, continuing anyway...", e);
  }
}


async function runMeeshoFlow() {
  const MEESHO_EMAIL = process.env.MEESHO_EMAIL;
  const MEESHO_PASSWORD = process.env.MEESHO_PASSWORD;
  const MEESHO_URL = process.env.MEESHO_URL || "https://supplier.meesho.com/panel/v3/new/root/login";

  if (!MEESHO_EMAIL || !MEESHO_PASSWORD) {
    throw new Error("MEESHO_EMAIL or MEESHO_PASSWORD env var missing");
  }

  console.log("🌐 Starting Meesho automation...");
  console.log("URL:", MEESHO_URL);

 const browser = await chromium.launch({
  headless: process.env.CI ? true : false, // CI me true, local pe false rakh sakta hai
  slowMo: process.env.CI ? 0 : 200,
});

  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  try {
    // 1) Open login page
    try {
      await page.goto(MEESHO_URL, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUT,
      });
    } catch (e) {
      console.error("⚠️ page.goto timeout/issue, continuing anyway...", e);
    }

    console.log("📍 Current URL after goto:", page.url());

    console.log("🔎 Waiting for email field...");
    await page.waitForSelector('input[name="emailOrPhone"]', {
      state: "visible",
      timeout: TIMEOUT,
    });

    console.log("✍️ Filling email and password...");

    const emailInput = page.locator('input[name="emailOrPhone"]');
    const passwordInput = page.locator('input[name="password"]');

    await emailInput.fill(MEESHO_EMAIL);
    await passwordInput.fill(MEESHO_PASSWORD);

    const loginButton = page.getByRole("button", { name: /log in|login/i });
    await safeClick(page, loginButton, "Login button");

    await page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT });
    console.log("✅ Logged in, waiting for dashboard...");
    await page.screenshot({
      path: "screenshots/after-login.png",
      fullPage: true,
    });

    // 2) Wait for Pending Orders card and click it
    console.log("⏳ Waiting for Pending Orders card...");

    const pendingOrdersCard = page
      .locator('p:has-text("Pending Orders")')
      .first();

    await pendingOrdersCard.waitFor({
      state: "visible",
      timeout: TIMEOUT,
    });

    console.log("✅ Pending Orders card is visible");

    const pendingOrdersBox = pendingOrdersCard.locator(
      "xpath=ancestor::div[@data-testid='box']"
    );

    await safeClick(page, pendingOrdersBox, "Pending Orders card");

    await page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT });
    console.log("📄 Pending Orders page opened");

    // // 3) Close popup (Returnless Refunds) if it appears
     await dismissPopups(page);

    // 4) Wait a bit for table to render
    await page.waitForTimeout(2000);

    // 5) Select all rows via checkbox
    const selectAllCheckbox = page.locator(
      'input[aria-label="select all rows"]'
    );
    await safeCheck(page, selectAllCheckbox, "Select all rows checkbox");

    // 6) Click "Accept Selected Orders"
    const acceptButton = page.getByRole("button", {
      name: "Accept Selected Orders",
    });
    await safeClick(page, acceptButton, "Accept Selected Orders button");

    // 7) Confirm modal → "Accept Order" button
    const confirmAcceptButton = page.getByRole("button", {
      name: "Accept Order",
    });

    await safeClick(page, confirmAcceptButton, "Confirm Accept Order button");

    await page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT });

    console.log(
      "🎉 Flow completed – pending orders accepted (jo selected the)."
    );
  } catch (err) {
    console.error("💥 Meesho flow failed:", err);
    process.exitCode = 1;
  } finally {
    await page.close();
    await browser.close();
  }
}

if (require.main === module) {
  runMeeshoFlow();
}

module.exports = { runMeeshoFlow };
