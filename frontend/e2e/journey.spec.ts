import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      rule: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        reason: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
}

test("register → upload → comment → private board → profile → logout", async ({
  page,
}, testInfo) => {
  const username = `journey_${testInfo.project.name}_${Date.now()}`;
  const password = "Curious!Garden29Blue";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/register");
  await accessible(page);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`${username}@example.invalid`);
  await page.locator("#password").fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Find your next little thing." }),
  ).toBeVisible();
  await expect(page.locator(".pin-card").first()).toBeVisible();
  await accessible(page);
  await page.screenshot({
    path: `../artifacts/feed-${testInfo.project.name}.png`,
  });
  await page.locator(".feed-status").last().scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.locator(".pin-card").count())
    .toBeGreaterThanOrEqual(24);
  const pins = await page
    .locator(".pin-image > a")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("href")),
    );
  expect(new Set(pins).size).toBe(pins.length);

  await page.getByRole("link", { name: "Create pin", exact: true }).click();
  await page
    .getByLabel("Choose pin image")
    .setInputFiles(resolve("e2e/fixtures/blue.png"));
  await expect(
    page.getByRole("img", { name: "Preview of your selected image" }),
  ).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("A blue beginning");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A synthetic image for browser verification.");
  await page.getByLabel("Tags", { exact: false }).fill("blue, curious");
  await page
    .getByLabel("Image description optional")
    .fill("A tiny blue inspiration image.");
  await page.getByRole("button", { name: "Publish pin", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A blue beginning", exact: true }),
  ).toBeVisible();
  const postURL = page.url();
  await accessible(page);
  await page.getByLabel("Your comment").fill("A little thought, kept.");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(
    page.getByText("A little thought, kept.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await accessible(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Create a new board" }).click();
  await page.getByLabel("Board name").fill("Curious blues");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create board", exact: true }).click();
  await expect(page.getByText("Saved to", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "View board" }).click();
  await expect(
    page.getByRole("heading", { name: "Curious blues", exact: true }),
  ).toBeVisible();
  const boardURL = page.url();
  await accessible(page);
  await page
    .getByRole("button", { name: "Use A blue beginning as board cover" })
    .click();
  await expect(
    page.getByRole("button", { name: "Use A blue beginning as board cover" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Your profile", exact: true }).click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page
    .getByLabel("Choose profile picture")
    .setInputFiles(resolve("e2e/fixtures/blue.png"));
  await expect(page.locator(".avatar-editor img")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save profile", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Curious Collector");
  await page
    .getByLabel("A little about you")
    .fill("Collecting blue beginnings.");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Curious Collector", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "A blue beginning", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Boards", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Curious blues" }),
  ).toBeVisible();
  await accessible(page);
  await page.getByLabel("Search pins and people").fill(username);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "A blue beginning", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(
    page.locator(".people-grid").getByText(`@${username}`, { exact: true }),
  ).toBeVisible();
  await accessible(page);
  await page.route("**/api/feed/?q=missing-curiosity*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "unavailable",
          message: "Unable to load pins. Try again.",
        },
      }),
    }),
  );
  await page.getByLabel("Search pins and people").fill("missing-curiosity");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Unable to load pins. Try again.",
  );
  await page.unroute("**/api/feed/?q=missing-curiosity*");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No matching pins. Try another idea." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  const privateBoard = await page.request.get(
    new URL(boardURL).pathname.replace("/boards/", "/api/boards/") + "/",
  );
  expect(privateBoard.status()).toBe(404);
  expect(
    (
      await page.request.get(
        new URL(postURL).pathname.replace("/posts/", "/api/posts/") + "/",
      )
    ).status(),
  ).toBe(200);
  expect(errors).toEqual([]);
});
