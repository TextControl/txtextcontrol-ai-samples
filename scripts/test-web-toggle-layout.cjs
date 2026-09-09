// Requires Playwright and Edge: npm install --no-save playwright
// Start the sample without loading a model, then run:
// node scripts/test-web-toggle-layout.cjs http://127.0.0.1:5187
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

async function main() {
    const url = process.argv[2];
    if (!url) throw new Error("Pass the URL of a running web sample.");
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
        for (const viewport of [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 390, height: 844 }
        ]) {
            const page = await browser.newPage({ viewport });
            try {
                await page.goto(url);
                await page.getByRole("button", { name: "Runtime", exact: true }).click();
                const checkLayout = async () => {
                    const state = await page.evaluate(() => ({
                        bottom: document.querySelector(".site-footer").getBoundingClientRect().bottom,
                        viewport: innerHeight,
                        scroll: document.scrollingElement.scrollTop,
                        bodyScroll: document.body.scrollTop
                    }));
                    assert.ok(Math.abs(state.bottom - state.viewport) <= 1, JSON.stringify(state));
                    assert.equal(state.scroll, 0, "Focusing a toggle must not scroll the outer document.");
                    assert.equal(state.bodyScroll, 0, "Only the workspace/card should scroll.");
                };
                await checkLayout();
                for (const name of ["enableMcp", "enableReasoning"]) {
                    const input = page.locator('input[name="' + name + '"]');
                    const label = page.locator(".toggle").filter({ has: input });
                    const initial = await input.isChecked();
                    await label.locator("strong").click();
                    assert.equal(await input.isChecked(), !initial);
                    await checkLayout();
                    await input.click();
                    assert.equal(await input.isChecked(), initial);
                    await checkLayout();
                    // Native keyboard focus must remain visible and must not move the outer page.
                    await input.focus();
                    await page.keyboard.press("Space");
                    assert.equal(await input.isChecked(), !initial);
                    await checkLayout();
                    await page.keyboard.press("Space");
                    assert.equal(await input.isChecked(), initial);
                    await checkLayout();
                }
                console.log("PASS " + url + " " + viewport.width + "x" + viewport.height + " — mouse and keyboard toggles");
            } finally { await page.close(); }
        }
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
