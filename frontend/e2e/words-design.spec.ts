import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import { completeInterests } from "./onboarding";

async function accessible(page: Page, selector = ".words-page") {
  const result = await new AxeBuilder({ page })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}
for (const width of [375, 768, 1440])
  test(`two-step Words at ${width}px: Upright, controls, drafts and publish`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 1000 });
    const username = `words_${width}_${Date.now()}`;
    await page.goto("/register");
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page
      .getByLabel("Email address", { exact: true })
      .fill(`${username}@example.invalid`);
    await page.locator("#password").fill("Curious!Garden29Blue");
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill("Curious!Garden29Blue");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await completeInterests(page);
    await page.goto("/create");
    const formats = page.getByRole("group", { name: "Create format" });
    await formats.getByRole("button", { name: "Words", exact: true }).click();
    const text = page.getByRole("textbox", { name: "Your words", exact: true });
    await expect(text).toHaveAttribute("placeholder", "What's on your mind?");
    await expect(page.locator(".words-owl .owl-sleep")).toBeVisible();
    await text.fill("A little idea, worth keeping.");
    await expect(
      page.getByRole("button", { name: "Next: Details" }),
    ).toBeEnabled();
    expect(
      await page.evaluate(() =>
        [...document.fonts].some(
          (font) =>
            font.family === "Upright Regular" && font.status === "loaded",
        ),
      ),
    ).toBe(true);
    await expect(page.locator(".words-owl .owl-idle")).toBeVisible();
    expect(
      await page
        .locator(
          ".words-page select,.words-page input[type=checkbox],.words-page input[type=range],.words-page input[type=color]",
        )
        .count(),
    ).toBe(0);
    async function tool(name: string) {
      await page
        .getByRole("group", { name: "Design tools" })
        .getByRole("button", { name, exact: true })
        .click();
      const panel =
        width < 768
          ? page.getByRole("dialog", { name: `${name} settings` })
          : page.getByRole("region", { name: `${name} settings` });
      await expect(panel).toBeVisible();
      return panel;
    }
    async function closeTool() {
      if (width < 768) {
        await page.keyboard.press("Escape");
        await expect(page.locator(".words-tool-sheet")).toHaveCount(0);
      }
    }
    let panel = await tool("Style");
    await expect(
      panel.getByRole("button", { name: /Upright Regular/ }),
    ).toHaveAttribute("aria-pressed", "true");
    const slider = panel.getByRole("slider", {
      name: "Font size",
      exact: true,
    });
    await slider.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "24");
    await slider.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "26");
    await slider.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "240");
    await panel
      .getByRole("button", { name: "Align left", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Align center", exact: true })
      .click();
    await accessible(page, width < 768 ? ".words-tool-sheet" : ".words-page");
    await closeTool();
    panel = await tool("Color");
    await panel
      .getByRole("button", { name: "Custom text color", exact: true })
      .click();
    await panel
      .getByRole("textbox", { name: "Custom text color", exact: true })
      .fill("#183247");
    await closeTool();
    await expect(page.locator(".words-contrast")).toBeVisible();
    await page
      .getByRole("button", { name: "Fix automatically", exact: true })
      .click();
    await expect(page.locator(".words-contrast")).toHaveCount(0);
    panel = await tool("Color");
    await panel
      .getByRole("switch", { name: "Highlight text", exact: true })
      .click();
    await expect(
      panel.getByRole("switch", { name: "Highlight text", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await closeTool();
    await expect(page.locator(".words-contrast")).toHaveCount(0);
    panel = await tool("Background");
    await panel
      .getByRole("button", { name: "Background color #f2e6c9", exact: true })
      .click();
    await panel
      .getByRole("button", { name: "Dusk gradient", exact: true })
      .click();
    await panel.getByRole("button", { name: "Paper", exact: true }).click();
    await panel
      .getByRole("button", { name: "sky illustration", exact: true })
      .click();
    await panel
      .getByLabel("Upload photo", { exact: true })
      .setInputFiles(resolve("e2e/fixtures/blue.png"));
    await expect(
      panel.getByRole("slider", { name: "Dark overlay", exact: true }),
    ).toBeVisible();
    await panel
      .getByRole("slider", { name: "Dark overlay", exact: true })
      .press("End");
    await closeTool();
    panel = await tool("Format");
    for (const ratio of ["1:1", "9:16", "4:5"]) {
      await panel
        .getByRole("button", { name: `Aspect ratio ${ratio}`, exact: true })
        .click();
      await expect
        .poll(() =>
          page
            .locator(".words-card canvas")
            .evaluate((c) => (c as HTMLCanvasElement).height),
        )
        .toBe(ratio === "1:1" ? 1080 : ratio === "9:16" ? 1920 : 1350);
    }
    await closeTool();
    await text.fill("x".repeat(281));
    expect((await text.inputValue()).length).toBe(280);
    await expect(page.locator("#words-counter")).toContainText("Almost full");
    const words = `A quieter kind of courage, ${width}.`;
    await text.fill(words);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(localStorage)
            .filter((key) => key.startsWith("behtrest:words-draft:"))
            .some((key) =>
              JSON.parse(localStorage.getItem(key)!).config.text.includes(
                "quieter kind",
              ),
            ),
        ),
      )
      .toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(text).toHaveValue(words);
    await page
      .getByRole("group", { name: "Create format" })
      .getByRole("button", { name: "Pin", exact: true })
      .click();
    const leave = page.getByRole("dialog", {
      name: "Leave Words?",
      exact: true,
    });
    await expect(leave).toBeVisible();
    await leave
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(text).toHaveValue(words);
    await page
      .getByRole("group", { name: "Create format" })
      .getByRole("button", { name: "Pin", exact: true })
      .click();
    await leave.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(page.getByLabel("Choose pin image")).toBeVisible();
    await page
      .getByRole("group", { name: "Create format" })
      .getByRole("button", { name: "Words", exact: true })
      .click();
    await expect(text).toHaveValue(words);
    await page.evaluate(() => history.back());
    await expect(leave).toBeVisible();
    await leave
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(text).toHaveValue(words);
    await page.evaluate(() => history.back());
    await expect(leave).toBeVisible();
    await leave.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(page.getByLabel("Choose pin image")).toBeVisible();
    await page
      .getByRole("group", { name: "Create format" })
      .getByRole("button", { name: "Words", exact: true })
      .click();
    await expect(text).toHaveValue(words);
    expect(
      await page
        .locator(".words-card")
        .evaluate(
          (el) => el.getBoundingClientRect().height <= innerHeight * 0.7 + 1,
        ),
    ).toBe(true);
    await accessible(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `../artifacts/words-design-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Next: Details" }).click();
    await expect(
      page.getByLabel("Title (optional)", { exact: true }),
    ).toHaveValue("");
    await page
      .getByRole("group", { name: "Suggested tags" })
      .getByRole("button", { name: "thoughts", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Add tag", exact: true })
      .fill("reflection");
    await page
      .getByRole("textbox", { name: "Add tag", exact: true })
      .press("Enter");
    await page
      .getByRole("textbox", { name: "Add context (optional)", exact: true })
      .fill("A note worth keeping.");
    await page
      .locator(".words-alt-row")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Alt text", exact: true })
      .fill("A typographic note about courage.");
    await page
      .locator(".words-alt-row")
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await page.locator(".words-advanced summary").click();
    await page
      .getByRole("switch", { name: "Allow downloads", exact: true })
      .click();
    await expect(
      page.getByText("Public. Be kind. Reports welcome.", { exact: true }),
    ).toBeVisible();
    expect(
      await page
        .locator(
          ".words-page select,.words-page input[type=checkbox],.words-page input[type=range],.words-page input[type=color]",
        )
        .count(),
    ).toBe(0);
    await accessible(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `../artifacts/words-details-${width}.png`,
      fullPage: true,
    });
    const responsePromise = page.waitForResponse(
      (r) => r.url().endsWith("/api/posts/") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Publish Words", exact: true })
      .click();
    const response = await responsePromise;
    const payload = await response.json();
    expect(response.status(), JSON.stringify(payload)).toBe(201);
    const post = payload.data;
    expect(post.type).toBe("text_card");
    expect(post.config.font).toBe("upright");
    expect(post.title).toBe(words);
    expect(post.tags).toEqual(
      expect.arrayContaining(["thoughts", "reflection"]),
    );
    expect(post.allow_download).toBe(false);
    expect(post.alt_text).toBe("A typographic note about courage.");
    expect(post.config.background.photo).toMatch(/^data:image\/jpeg;base64,/);
    await expect(page).toHaveURL(new RegExp(`/pin/${post.id}$`));
    await expect(
      page.getByRole("dialog", { name: "Leave Words?", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith("behtrest:words-draft:"),
        ),
      ),
    ).toEqual([]);
    await page
      .getByRole("button", { name: "More pin actions", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "More pin actions", exact: true })
      .getByRole("button", { name: "Edit pin", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Your words", exact: true }),
    ).toHaveValue(words);
  });
