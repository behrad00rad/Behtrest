import { completeInterests } from "./onboarding";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signup(page: Page, username: string, code = "") {
  await page.goto("/register");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`${username}@example.invalid`);
  await page.getByLabel(/^Password/).fill("Referral!Garden947");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Referral!Garden947");
  if (code) await page.getByLabel(/Referral code/).fill(code);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
}

test("invite-only signup, administrator controls and code replacement", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const adminContext = await browser.newContext({
    ...info.project.use,
    baseURL: "http://127.0.0.1:5174",
  });
  const guestContext = await browser.newContext({
    ...info.project.use,
    baseURL: "http://127.0.0.1:5174",
  });
  const admin = await adminContext.newPage(),
    guest = await guestContext.newPage();
  const username = `invite_${info.project.name}_${Date.now()}`;
  try {
    await signup(page, username);
    await expect(page).toHaveURL(/5174\/$/);
    await completeInterests(page);
    await page.goto(`/u/${username}`);
    const code = await page
      .locator('section[aria-label="Your invites"] code')
      .innerText();
    await page.goto("/settings/referrals");
    await expect(
      page.getByRole("heading", { name: "Administrator access required" }),
    ).toBeVisible();
    await admin.goto("/login");
    await admin.getByLabel("Username", { exact: true }).fill("e2e_moderator");
    await admin.getByLabel(/^Password/).fill("Moderation!TestGarden29");
    await admin.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(admin).toHaveURL(/5174\/$/);
    await completeInterests(admin);
    await admin.goto("/settings/referrals");
    await admin.getByLabel("Require an invite to create an account").check();
    await admin.getByLabel("Invites per member", { exact: true }).fill("1");
    await admin
      .getByRole("button", { name: "Save registration settings" })
      .click();
    await expect(admin.getByText("Registration settings saved.")).toBeVisible();
    await admin.getByLabel("Find a member").fill(username);
    const member = admin.locator("article.invite-member");
    await expect(member).toHaveCount(1);
    await member.getByLabel("Personal allowance").fill("0");
    await member.getByRole("button", { name: "Save member" }).click();
    await expect(member.getByLabel("Personal allowance")).toHaveValue("0");
    await signup(guest, `${username}_guest`, code);
    await expect(
      guest.getByText(
        "This referral code is invalid or has no invites remaining.",
      ),
    ).toBeVisible();
    await member.getByLabel("Personal allowance").fill("1");
    await member.getByRole("button", { name: "Save member" }).click();
    await member
      .getByRole("button", { name: "Replace code", exact: true })
      .click();
    await member.getByRole("button", { name: "Replace now" }).click();
    await expect(member.locator("code")).not.toHaveText(code);
    const replacement = await member.locator("code").innerText();
    await guest
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      guest.getByText(
        "This referral code is invalid or has no invites remaining.",
      ),
    ).toBeVisible();
    await guest.getByLabel(/Referral code/).fill(replacement);
    await guest
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(guest).toHaveURL(/5174\/$/);
    const axe = await new AxeBuilder({ page: admin })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(axe.violations.map((item) => item.id)).toEqual([]);
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  } finally {
    const session = await admin.request.get("/api/auth/session/");
    const csrf = (await session.json()).data.csrfToken;
    await admin.request.patch("/api/auth/admin/referrals/settings/", {
      data: { invite_required: false, referrals_per_user: 5 },
      headers: { "X-CSRFToken": csrf, Origin: "http://127.0.0.1:5174" },
    });
    await adminContext.close();
    await guestContext.close();
  }
});
