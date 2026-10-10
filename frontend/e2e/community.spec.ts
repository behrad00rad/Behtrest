import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";

async function register(page: Page, username: string) {
  await page.goto("/register");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`${username}@example.invalid`);
  await page.locator("#password").fill("Blue!CuriousGarden29");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Blue!CuriousGarden29");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Find your next little thing." }),
  ).toBeVisible();
}
async function accessible(page: Page) {
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    axe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
}

test("follow, activity preferences, report review, and reversible moderation", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const peerContext = await browser.newContext({
    ...info.project.use,
    baseURL: "http://127.0.0.1:5174",
  });
  const staffContext = await browser.newContext({
    ...info.project.use,
    baseURL: "http://127.0.0.1:5174",
  });
  const peer = await peerContext.newPage(),
    staff = await staffContext.newPage();
  const alice = `social_a_${info.project.name}_${Date.now()}`,
    bob = `social_b_${info.project.name}_${Date.now()}`;
  const errors: string[] = [];
  for (const p of [page, peer, staff])
    p.on("pageerror", (e) => errors.push(e.message));
  try {
    await register(page, alice);
    await register(peer, bob);
    await expect(page).toHaveTitle(/Behtrest/);
    await page.goto("/create");
    await page
      .getByLabel("Choose pin image")
      .setInputFiles(resolve("e2e/fixtures/blue.png"));
    await page
      .getByLabel("Title", { exact: true })
      .fill(`Social blue ${info.project.name}`);
    await page
      .getByRole("button", { name: "Publish pin", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: `Social blue ${info.project.name}`,
        exact: true,
      }),
    ).toBeVisible();
    const postURL = page.url();
    // Followers should see this pin only after the asynchronous image check.
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    await peer.goto(`/u/${alice}`);
    await peer.getByRole("button", { name: "Follow", exact: true }).click();
    await expect(
      peer.getByRole("button", { name: "Following", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await peer
      .getByRole("button", { name: "1 followers", exact: true })
      .click();
    await expect(peer.getByRole("dialog")).toContainText(bob);
    await peer.keyboard.press("Escape");
    await peer.goto("/?feed=following");
    await expect(
      peer.locator(`a.pin-title[href="${new URL(postURL).pathname}"]`),
    ).toBeVisible();
    await accessible(peer);
    await peer.goto(postURL);
    await peer.getByLabel("Your comment").fill("A social notification thought");
    await peer
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
    await expect(
      peer.getByText("A social notification thought", { exact: true }),
    ).toBeVisible();
    await page.goto("/notifications");
    await expect(page.locator(".activity-row")).toHaveCount(2);
    await expect(page.locator(".activity-row")).toContainText([
      "commented on your pin",
      "started following you",
    ]);
    await accessible(page);
    await page
      .getByRole("button", { name: "Preferences", exact: true })
      .click();
    await page.getByLabel("Comments on your pins", { exact: true }).uncheck();
    await expect(
      page.getByLabel("Comments on your pins", { exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByLabel("Comments on your pins", { exact: true }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");
    await peer.getByLabel("Your comment").fill("This notification is disabled");
    await peer
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
    await expect(
      peer.getByText("This notification is disabled", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator(".activity-row")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Mark all read", exact: true })
      .click();
    await expect(page.locator(".activity-row.unread")).toHaveCount(0);
    await page.getByRole("button", { name: "Unread", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "You're all caught up" }),
    ).toBeVisible();
    await page.screenshot({
      path: `../artifacts/activity-${info.project.name}.png`,
    });
    await peer.getByRole("button", { name: "Report pin", exact: true }).click();
    await peer
      .getByLabel("Reason", { exact: true })
      .fill("Please review this synthetic pin");
    await peer
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    await expect(
      peer.getByRole("heading", { name: "Report received" }),
    ).toBeVisible();
    await peer.getByRole("button", { name: "Done", exact: true }).click();
    await peer.goto("/moderation");
    await expect(
      peer.getByRole("heading", { name: "Moderation is restricted" }),
    ).toBeVisible();
    await staff.goto("/login");
    await staff.getByLabel("Username", { exact: true }).fill("e2e_moderator");
    await staff.locator("#password").fill("Moderation!TestGarden29");
    await staff.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      staff.getByRole("heading", { name: "Find your next little thing." }),
    ).toBeVisible();
    await staff.goto("/moderation");
    const row = staff.locator(".moderation-row").filter({ hasText: alice });
    await row.getByRole("button", { name: /^Review report/ }).click();
    await staff.getByLabel("Action", { exact: true }).selectOption("hide");
    await staff
      .getByLabel("Decision reason", { exact: true })
      .fill("Hide for browser verification");
    await staff
      .getByRole("button", { name: "Apply decision", exact: true })
      .click();
    await expect(staff.locator(".review-log")).toContainText(
      "Hide for browser verification",
    );
    await accessible(staff);
    await staff.screenshot({
      path: `../artifacts/moderation-${info.project.name}.png`,
    });
    await peer.goto(postURL);
    await expect(
      peer.getByText("This item was not found.", { exact: true }),
    ).toBeVisible();
    await staff.getByLabel("Action", { exact: true }).selectOption("restore");
    await staff
      .getByLabel("Decision reason", { exact: true })
      .fill("Restore after verification");
    await staff
      .getByRole("button", { name: "Apply decision", exact: true })
      .click();
    await expect(staff.locator(".review-log")).toHaveCount(2);
    await peer.goto(postURL);
    await expect(
      peer.getByRole("heading", {
        name: `Social blue ${info.project.name}`,
        exact: true,
      }),
    ).toBeVisible();
    await peer.goto(`/u/${alice}`);
    await peer.getByRole("button", { name: "Following", exact: true }).click();
    await expect(
      peer.getByRole("button", { name: "Follow", exact: true }),
    ).toBeVisible();
    await peer.goto("/?feed=following");
    await expect(
      peer.getByRole("heading", { name: "Your following feed is quiet" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await peerContext.close();
    await staffContext.close();
  }
});
