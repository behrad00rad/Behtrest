import { test, expect } from "@playwright/test";

test.use({ isMobile: true, hasTouch: true });
test.skip(
  process.env.BEHTREST_E2E_PREVIEW !== "1",
  "Run with BEHTREST_E2E_PREVIEW=1 against the disposable test database.",
);

for (const width of [360, 375, 414, 768, 1440]) {
  test(`guest can sign in; navigation and pages fit at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 740 });
    const username = `mobile_${width}_${Date.now()}`;
    await page.goto("/register");
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.locator("#password").fill("simple");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.locator(".pin-card").first()).toBeVisible();
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.locator("#username")).toBeVisible();
    await page.getByRole("button", { name: "Explore as a guest" }).click();
    await expect(page.locator(".pin-card").first()).toBeVisible();
    await page
      .getByRole("complementary", { name: "Preview notice" })
      .getByRole("link", { name: "Sign in", exact: true })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("#username")).toBeVisible();
    await page.locator("#username").fill(username);
    await page.locator("#password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await page.locator("#password").fill("simple");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(".pin-card").first()).toBeVisible();
    expect(
      await page.evaluate(
        async () =>
          (await (await fetch("/api/auth/session/")).json()).data.user.username,
      ),
    ).toBe(username);
    if (width < 768) {
      const nav = page.getByRole("navigation", { name: "Mobile navigation" });
      for (const y of [400, 850, 200, 0]) {
        await page.evaluate((top) => scrollTo(0, top), y);
        await page.waitForTimeout(250);
        expect(
          await nav.evaluate((el) =>
            Math.abs(el.getBoundingClientRect().bottom - innerHeight),
          ),
        ).toBeLessThan(2);
      }
      await page.evaluate(() => scrollTo(0, 600));
      await page.waitForTimeout(250);
      await nav.getByRole("link", { name: "Create pin" }).click();
      await expect(page).toHaveURL(/\/create$/);
    }
    for (const route of [
      "/",
      "/settings",
      `/u/${username}`,
      "/messages",
      "/create",
      "/create?mode=words",
    ]) {
      await page.goto(route);
      await expect(page.locator("main").first()).toBeVisible();
      if (route.startsWith("/u/")) {
        await expect(
          page.getByRole("button", { name: "Edit profile", exact: true }),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    if (width < 768) {
      await page.setViewportSize({ width, height: 450 });
      const input = page.getByRole("textbox", {
        name: "Your words",
        exact: true,
      });
      await input.focus();
      await input.fill("A little room to type.");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await input.fill("");
      await page
        .getByRole("group", { name: "Design tools" })
        .getByRole("button", { name: "Style", exact: true })
        .click();
      const sheet = page.getByRole("dialog", { name: "Style settings" });
      await expect(sheet).toBeVisible();
      await expect
        .poll(() =>
          sheet.evaluate(
            (el) => el.getBoundingClientRect().bottom <= innerHeight + 1,
          ),
        )
        .toBe(true);
      await page.keyboard.press("Escape");
    }
  });
}
