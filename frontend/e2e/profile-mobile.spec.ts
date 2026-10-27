import { test, expect, type Page } from "@playwright/test";

test.skip(
  process.env.BEHTREST_E2E_PREVIEW !== "1",
  "Uses only the disposable preview test database.",
);

async function audit(page: Page, mobile: boolean) {
  if (mobile) {
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--safe-top", "24px");
      document.documentElement.style.setProperty("--safe-bottom", "34px");
    });
    await page.waitForTimeout(100);
  }
  const result = await page.evaluate(() => {
    const raw = [...document.querySelectorAll<HTMLElement>("*")].filter(
      (e) => e.getBoundingClientRect().right > innerWidth + 1,
    );
    const escaped = raw
      .filter((e) => {
        if (
          !e.getClientRects().length ||
          getComputedStyle(e).visibility === "hidden"
        )
          return false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          if (
            /auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX) &&
            p.getBoundingClientRect().right <= innerWidth + 1
          )
            return false;
        }
        return true;
      })
      .map((e) => `${e.tagName}.${e.getAttribute("class") || ""}`);
    const smallInputs = [
      ...document.querySelectorAll<HTMLInputElement>("input,textarea"),
    ]
      .filter(
        (e) =>
          e.getBoundingClientRect().width > 0 &&
          parseFloat(getComputedStyle(e).fontSize) < 16,
      )
      .map((e) => e.getAttribute("aria-label") || e.name);
    const clippedControls = [
      ...document.querySelectorAll<HTMLElement>(
        ".site-header .wordmark, .site-header .activity-trigger, .mobile-nav > a",
      ),
    ]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
      })
      .map((e) => e.getAttribute("aria-label") || e.className);
    return {
      escaped,
      smallInputs,
      clippedControls,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
  expect(result.escaped, `viewport offenders on ${page.url()}`).toEqual([]);
  expect(result.clippedControls).toEqual([]);
  expect(result.overflow).toBeLessThanOrEqual(1);
  if (mobile)
    expect(result.smallInputs, `small input fonts on ${page.url()}`).toEqual(
      [],
    );
}

for (const width of [375, 390, 430, 768, 1440]) {
  test(`Profile and shared page geometry at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const mobile = width < 768;
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/login");
    await page.getByRole("button", { name: "Explore as a guest" }).click();
    await expect(page.locator(".feed-pin").first()).toBeVisible();
    const session = await page.evaluate(
      async () => (await (await fetch("/api/auth/session/")).json()).data,
    );
    const pin = await page.locator(".pin-open").first().getAttribute("href");
    if (mobile)
      await page.addStyleTag({
        content: ":root { --safe-top: 24px; --safe-bottom: 34px; }",
      });
    await audit(page, mobile);
    if (mobile) {
      for (const height of [664, 844]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => scrollTo(0, 400));
        await page.waitForTimeout(250);
        const nav = page.getByRole("navigation", { name: "Mobile navigation" });
        expect(
          await nav.evaluate((e) =>
            Math.abs(e.getBoundingClientRect().bottom - innerHeight),
          ),
        ).toBeLessThan(2);
        const geometry = await nav.locator(":scope > a").evaluateAll((items) =>
          items.map((e) => ({
            left: e.getBoundingClientRect().left,
            right: e.getBoundingClientRect().right,
            width: e.getBoundingClientRect().width,
          })),
        );
        expect(geometry).toHaveLength(5);
        expect(
          Math.max(...geometry.map((e) => e.width)) -
            Math.min(...geometry.map((e) => e.width)),
        ).toBeLessThan(1);
        expect(geometry.every((e) => e.left >= 0 && e.right <= width)).toBe(
          true,
        );
        await expect(page.locator(".site-footer")).toBeHidden();
      }
      await page.setViewportSize({ width, height: 844 });
    }
    await page.goto(`/u/${session.user.username}`);
    await expect(
      page.getByRole("button", { name: "Edit profile", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nothing here yet" }),
    ).toBeVisible();
    await expect(
      page.getByText("Share a pin or write a few words.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".empty-state .primary-button")).toHaveText(
      "Create",
    );
    expect(
      await page.locator(".empty-state .primary-button").evaluate((e) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--accent)";
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return getComputedStyle(e).backgroundColor === color;
      }),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "Browse ideas", exact: true }),
    ).toBeVisible();
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `../artifacts/profile-polish-${test.info().project.name}-${width}.png`,
        fullPage: true,
      });
    expect(
      await page
        .locator(".profile-tabs")
        .evaluate(
          (e) =>
            e.getBoundingClientRect().width /
            e.parentElement!.getBoundingClientRect().width,
        ),
    ).toBeGreaterThan(0.98);
    await page
      .getByRole("button", { name: "Search profile", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Search profile content" }),
    ).toBeVisible();
    await audit(page, mobile);
    await page
      .getByRole("button", { name: "Invite a friend", exact: true })
      .click();
    const invite = page.getByRole("dialog", {
      name: "Invite a friend",
      exact: true,
    });
    await expect(invite).toBeVisible();
    expect(
      await invite.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(invite).toBeHidden();
    await page.getByRole("button", { name: "Liked", exact: true }).click();
    await expect(
      page.locator(".profile-tools").getByRole("link", { name: "Create pin" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Boards", exact: true }).click();
    await expect(
      page
        .locator(".profile-tools")
        .getByRole("button", { name: "New board", exact: true }),
    ).toBeVisible();
    await audit(page, mobile);
    for (const route of ["/", "/boards", "/messages", "/create", pin!]) {
      await page.goto(route);
      await expect(page.locator("main").first()).toBeVisible();
      if (route === "/")
        await expect(page.locator(".feed-pin").first()).toBeVisible();
      if (route === pin)
        await expect(page.locator(".detail-image img")).toBeVisible();
      await audit(page, mobile);
      if (mobile)
        await expect(
          page.getByRole("navigation", { name: "Mobile navigation" }),
        ).toBeVisible();
    }
    const chatId = await page.evaluate(
      async ({ path, token }) => {
        const post = (
          await (await fetch(`/api/posts/${path!.split("/").pop()}/`)).json()
        ).data;
        const response = await fetch("/api/chat/conversations/", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRFToken": token },
          body: JSON.stringify({ username: post.owner.username }),
        });
        return (await response.json()).data.id;
      },
      { path: pin, token: session.csrfToken },
    );
    await page.goto(`/messages/${chatId}`);
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeVisible();
    await audit(page, mobile);
    if (mobile) {
      const nav = page.getByRole("navigation", { name: "Mobile navigation" });
      await expect(nav).toBeVisible();
      expect(
        await page
          .locator(".chat-composer")
          .evaluate((e) => e.getBoundingClientRect().bottom),
      ).toBeLessThanOrEqual(
        (await nav.evaluate((e) => e.getBoundingClientRect().top)) + 1,
      );
    }
    await page.goto("/");
    await page.locator(".pin-open").first().click();
    const pinDialog = page.getByRole("dialog", {
      name: "Pin details",
      exact: true,
    });
    await expect(pinDialog).toBeVisible();
    if (mobile)
      await expect(
        pinDialog.getByRole("navigation", { name: "Mobile navigation" }),
      ).toBeVisible();
    await audit(page, mobile);
    await page.keyboard.press("Escape");
    await page.goto("/create?mode=words");
    const words = page.getByRole("textbox", {
      name: "Your words",
      exact: true,
    });
    await expect(words).toBeVisible();
    await words.fill("A".repeat(280));
    await page.waitForTimeout(200);
    await audit(page, mobile);
    await words.fill("");
  });
}
