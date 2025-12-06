require("dotenv").config();
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

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

// 🧹 labels folder clean: N din se purane files hata do
function cleanupOldFiles(dir, maxAgeDays) {
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (!fs.existsSync(dir)) return;

  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;

      const age = now - stat.mtimeMs;
      if (age > maxAgeMs) {
        fs.unlinkSync(fullPath);
        console.log(`🧽 Deleted old label: ${fullPath}`);
      }
    } catch (e) {
      console.warn("⚠️ Failed to check/delete file:", fullPath, e);
    }
  }
}

// 👇 Popup close helper (Fast Delivery dialog / Skip / X svg / Got it)
async function dismissPopups(page, context = "") {
  console.log(
    `🧹 Trying to dismiss popups ${context ? "(" + context + ")" : ""}...`
  );

  try {
    await page.waitForTimeout(1500);

    // 0️⃣ Fast delivery orders policy dialog (special case)
    const fastDialog = page
      .locator('[role="dialog"]')
      .filter({ hasText: "Fast delivery orders policy" })
      .first();

    if (await fastDialog.count()) {
      console.log("🔎 Found 'Fast delivery orders policy' dialog");

      const fastSkip = fastDialog.getByText("Skip", { exact: true });
      if (await fastSkip.isVisible().catch(() => false)) {
        await fastSkip.click({ force: true });
        await page.waitForTimeout(800);
        console.log("✅ Closed fast-delivery dialog via Skip");
        return;
      }

      const fastCloseIcon = fastDialog.locator("svg.css-1fmevri").first();
      if (await fastCloseIcon.isVisible().catch(() => false)) {
        await fastCloseIcon.click({ force: true });
        await page.waitForTimeout(800);
        console.log("✅ Closed fast-delivery dialog via X icon");
        return;
      }
    }

    // (A) "Got it" button via span -> parent button
    const gotItSpan = page.locator('span:has-text("Got it")').first();
    if (await gotItSpan.count()) {
      const gotItButton = gotItSpan
        .locator("xpath=ancestor::button[1]")
        .first();
      const visible = await gotItButton.isVisible().catch(() => false);

      console.log(
        "🔎 Got it span count:",
        await gotItSpan.count(),
        "button visible:",
        visible
      );

      if (visible) {
        await safeClick(page, gotItButton, "Got it button (via span parent)");
        await page.waitForTimeout(800);
        console.log("✅ Dismissed popup via Got it (span->button)");
        return;
      }
    }

    // (B) Direct role-based Got it button (fallback)
    const gotItBtn = page.getByRole("button", { name: /got it/i });
    if (await gotItBtn.count()) {
      const visibleGotIt = await gotItBtn.first().isVisible().catch(() => false);
      console.log(
        "🔎 getByRole Got it count:",
        await gotItBtn.count(),
        "visible:",
        visibleGotIt
      );
      if (visibleGotIt) {
        await safeClick(page, gotItBtn.first(), "Got it button (role=button)");
        await page.waitForTimeout(800);
        console.log("✅ Dismissed popup via Got it (role)");
        return;
      }
    }

    // (C) Skip overlay – button
    const skipButton = page.getByRole("button", { name: /skip/i }).first();
    if (await skipButton.count()) {
      const visibleSkip = await skipButton.isVisible().catch(() => false);
      console.log(
        "🔎 Skip button (role) count:",
        await skipButton.count(),
        "visible:",
        visibleSkip
      );
      if (visibleSkip) {
        await safeClick(page, skipButton, "Skip button (role)");
        await page.waitForTimeout(800);
        console.log("✅ Dismissed popup via Skip button");
        return;
      }
    }

    // (D) Skip overlay – span
    const skipSpan = page
      .locator('span.MuiTypography-button:has-text("Skip")')
      .first();
    if (await skipSpan.count()) {
      console.log("🔎 Found Skip span for popup (generic)");
      const skipContainer = skipSpan
        .locator('xpath=ancestor::div[contains(@class,"css-gq3nwx")]')
        .first();
      const target = (await skipContainer.count()) ? skipContainer : skipSpan;
      await safeClick(page, target, "Skip popup area (span parent)");
      await page.waitForTimeout(800);
      console.log("✅ Dismissed popup via Skip area");
      return;
    }

    // (E) X icon (close) svg with class css-1fmevri (generic)
    const closeSvg = page.locator("svg.css-1fmevri").first();
    if (await closeSvg.count()) {
      const visibleClose = await closeSvg.isVisible().catch(() => false);
      console.log(
        "🔎 X svg count:",
        await closeSvg.count(),
        "visible:",
        visibleClose
      );
      if (visibleClose) {
        await closeSvg.waitFor({ state: "visible", timeout: TIMEOUT });
        await closeSvg.click({ force: true });
        await page.waitForTimeout(800);
        console.log("✅ Closed popup via X svg");
        return;
      }
    }

    // (F) Generic dialog close – Escape
    const anyDialog = page.locator('[role="dialog"]').first();
    if (await anyDialog.count()) {
      const visibleDialog = await anyDialog.isVisible().catch(() => false);
      console.log(
        "🔎 Generic dialog count:",
        await anyDialog.count(),
        "visible:",
        visibleDialog
      );
      if (visibleDialog) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(800);
        console.log("✅ Tried closing dialog via Escape key");
        return;
      }
    }

    console.log("ℹ️ No known popup/dialog detected.");
  } catch (e) {
    console.warn("⚠️ dismissPopups had an issue, continuing anyway...", e);
  }
}

// ✅ Ready to Ship + Label download helper (footer bar + dialog)
async function handleReadyToShipAndDownloadLabels(page) {
  console.log("➡️ Going to Ready to Ship tab...");

  const readyToShipTab = page
    .getByRole("tab", { name: /ready to ship/i })
    .first();

  if (await readyToShipTab.count()) {
    await safeClick(page, readyToShipTab, "Ready to Ship tab");
  }

  // table render hone ka time
  await page.waitForTimeout(2000);

  // Ready to Ship table me "select all rows" checkbox
  const rtsSelectAllCheckbox = page.locator(
    'input[aria-label="select all rows"]'
  );
  const checkboxCount = await rtsSelectAllCheckbox.count();

  if (!checkboxCount) {
    console.log("ℹ️ Ready to Ship me koi rows nahi milin, label download skip.");
    return;
  }

  await safeCheck(
    page,
    rtsSelectAllCheckbox,
    "Ready to Ship - select all rows checkbox"
  );

  // Footer bar ("xxx/xxx Orders Selected") appear hone ka wait
  await page.waitForTimeout(1500);

  // 🔍 Sticky footer bar (jisme "199/199 Orders Selected" type text hota hai)
  const footerBar = page
    .locator('div.MuiBox-root:has(p:has-text("Orders Selected"))')
    .last();

  await footerBar.waitFor({ state: "visible", timeout: TIMEOUT });

  const footerText = await footerBar
    .locator("p.MuiTypography-body1")
    .first()
    .innerText()
    .catch(() => "");
  console.log("📦 Footer bar text:", footerText);

  // Footer ke andar ka Label button (Manifest ke saath)
  const footerLabelBtn = footerBar
    .getByRole("button", { name: /^Label$/i })
    .first();

  if (!(await footerLabelBtn.count())) {
    console.log("⚠️ Footer Label button nahi mila – skip kar rahe.");
    return;
  }

  // Wait until footer Label enabled
  let enabled = await footerLabelBtn.isEnabled().catch(() => false);
  const start = Date.now();
  while (!enabled && Date.now() - start < 60_000) {
    console.log("⏳ Footer Label disabled, waiting 1s...");
    await page.waitForTimeout(1000);
    enabled = await footerLabelBtn.isEnabled().catch(() => false);
  }

  if (!enabled) {
    console.log(
      "⚠️ Footer Label button 60s tak enabled nahi hua, download skip kar rahe."
    );
    return;
  }

  console.log("✅ Footer Label enabled, clicking (yehi dialog open karega)...");
  await footerLabelBtn.click({ force: true });

  // 🔄 Ab wahi dialog wait karo jisme "Ready to Ship Labels" likha hai
  // Yaha role="dialog" hai, aur andar span me ye text hai (jo tumne HTML me diya)
  const labelsDialog = page
    .locator('[role="dialog"]')
    .filter({ hasText: "Ready to Ship Labels" })
    .first();

  await labelsDialog.waitFor({ state: "visible", timeout: 60_000 });
  console.log("📋 'Ready to Ship Labels' dialog visible");

  // ⚠️ IMPORTANT: yahi dialog pehle loading show karega,
  // fir success text + Label button show karega.
  // Isliye hum directly uske andar ke Label button ka wait karenge.

  const dialogLabelBtn = labelsDialog
    .locator('button:has(span.MuiTypography-button:has-text("Label"))')
    .first();

  await dialogLabelBtn.waitFor({ state: "visible", timeout: 300_000 });
  console.log("✅ Dialog Label button visible (loading done).");

  // ensure enabled
  let dialogEnabled = await dialogLabelBtn.isEnabled().catch(() => false);
  const dStart = Date.now();
  while (!dialogEnabled && Date.now() - dStart < 60_000) {
    console.log("⏳ Dialog Label disabled, waiting 1s...");
    await page.waitForTimeout(1000);
    dialogEnabled = await dialogLabelBtn.isEnabled().catch(() => false);
  }

  if (!dialogEnabled) {
    console.log("⚠️ Dialog Label 60s tak enabled nahi hua.");
    return;
  }

  console.log("⬇️ Clicking dialog Label button to start download...");

  // 🔐 Folder ensure + purane files clean
  const saveDir = "labels";
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }
  cleanupOldFiles(saveDir, 10); // 10 din se purane label delete

  let download = null;
  try {
    [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }).catch(() => null),
      dialogLabelBtn.click({ force: true }),
    ]);
  } catch (e) {
    console.warn("⚠️ Error while clicking dialog Label / waiting download:", e);
  }

  if (!download) {
    console.log(
      "ℹ️ Download event detect nahi hua – ho sakta hai new tab/print dialog khula ho (ya Meesho ne behaviour change kiya ho)."
    );
    return;
  }

  const filePath = path.join(saveDir, `label-${Date.now()}.pdf`);

  try {
    await download.saveAs(filePath);
    console.log("📁 LABEL SAVED →", filePath);
  } catch (e) {
    console.warn("⚠️ Could not save label explicitly:", e);
  }

  console.log("✅ Ready to Ship flow done – labels downloaded (if any).");
}


async function runMeeshoFlow() {
  const MEESHO_EMAIL = process.env.MEESHO_EMAIL;
  const MEESHO_PASSWORD = process.env.MEESHO_PASSWORD;
  const MEESHO_URL =
    process.env.MEESHO_URL || "https://supplier.meesho.com/";

  if (!MEESHO_EMAIL || !MEESHO_PASSWORD) {
    throw new Error("MEESHO_EMAIL or MEESHO_PASSWORD env var missing");
  }

  console.log("🌐 Starting Meesho automation...");
  console.log("URL:", MEESHO_URL);

  const browser = await chromium.launch({
    headless: false, // CI me true kar sakta hai
    slowMo: 200,
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

    await dismissPopups(page, "after opening Pending Orders");

    // 4) Wait a bit for table + tabs to render
    await page.waitForTimeout(2000);

    // 🧮 Pending tab ka count check karo: "Pending (0)" ya "Pending (5)" etc.
    const pendingTab = page.getByRole("tab", { name: /pending/i }).first();
    await pendingTab.waitFor({ state: "visible", timeout: TIMEOUT });

    const pendingText = await pendingTab.innerText();
    console.log("📊 Pending tab text:", pendingText);

    let pendingCount = 0;
    const match = pendingText.match(/\((\d+)\)/);
    if (match) {
      pendingCount = parseInt(match[1], 10);
    }
    console.log("📊 Parsed pending count:", pendingCount);

    if (pendingCount === 0) {
      console.log(
        "ℹ️ Pending (0) hai – accept flow skip, direct Ready to Ship chalu."
      );
      await handleReadyToShipAndDownloadLabels(page);
      console.log(
        "🎉 Flow completed – no pending orders, Ready to Ship labels handled."
      );
      return;
    }

    console.log("✅ Pending > 0 hai – normal accept flow chalayenge.");

    // 5) Select all rows via checkbox (Pending tab)
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

    // 🔄 Wait for "Accepting orders / Processing..." to finish
console.log("⏳ Waiting for Accepting Orders processing dialog...");

let gotItFound = false;

try {
  // Dialog jisme "Accepting orders" ya "Processing" hota hai
  const processingDialog = page
    .locator('[role="dialog"]')
    .filter({ hasText: "Accepting" });

  await processingDialog.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

  // 60 sec tak wait karo ki ye dialog close ho jaye
  const start = Date.now();
  while (Date.now() - start < 60000) {
    const isVisible = await processingDialog.isVisible().catch(() => false);
    if (!isVisible) break;
    console.log("⌛ Processing dialog still open... waiting");
    await page.waitForTimeout(2000);
  }

  console.log("🔍 Checking for Got It popup...");

  const gotItButton = page.getByRole("button", { name: /got it/i });

  // 20 sec tak wait karo "Got It" ke liye
  const gotItStart = Date.now();
  while (Date.now() - gotItStart < 20000) {
    if (await gotItButton.isVisible().catch(() => false)) {
      console.log("🎉 Got It popup detected!");
      await gotItButton.click({ force: true });
      gotItFound = true;
      break;
    }
    await page.waitForTimeout(1500);
  }

  // Agar 20 sec me Got It Nahi aaya → Refresh + try again
  if (!gotItFound) {
    console.log("⚠️ Got It popup not found. Refreshing page...");
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.waitForTimeout(4000);

    // DUWARA check karo Got It
    if (await gotItButton.isVisible().catch(() => false)) {
      console.log("🎉 Got It found after refresh!");
      await gotItButton.click({ force: true });
      gotItFound = true;
    } else {
      console.log("⚠️ Still no Got It popup after refresh. Continuing...");
    }
  }
} catch (e) {
  console.warn("⚠️ Error in Accepting Orders + Got It handling:", e);
}


    // 2) "Got it" button waala popup close karo
    await dismissPopups(page, "after processing orders (Got it)");

    // 3) Ready to Ship + Labels
    await handleReadyToShipAndDownloadLabels(page);

    console.log(
      "🎉 Flow completed – pending orders accepted & labels downloaded."
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
