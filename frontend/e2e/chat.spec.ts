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

test("two people: requests, live messages, image, edit, reaction, group and block", async ({
  page,
  browser,
}, info) => {
  const peerContext = await browser.newContext({
    ...info.project.use,
    baseURL: "http://127.0.0.1:5174",
  });
  const peer = await peerContext.newPage();
  const suffix = `${info.project.name}_${Date.now()}`;
  const alice = `alice_${suffix}`,
    bob = `bob_${suffix}`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  peer.on("pageerror", (e) => errors.push(e.message));
  try {
    await register(page, alice);
    await register(peer, bob);
    await page.goto("/messages");
    await page
      .getByLabel("Search conversations and people")
      .fill("@" + bob.slice(0, -3));
    await page
      .getByRole("button", { name: `Choose @${bob}`, exact: true })
      .click();
    await expect(page).toHaveURL(/\/messages\/\d+$/);
    const searchedURL = page.url();
    await page.goto(`/messages?to=${bob}`);
    await page
      .getByRole("button", { name: `Choose @${bob}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start conversation", exact: true })
      .click();
    await expect(page).toHaveURL(searchedURL);
    await expect(page.locator(".connection-status")).toHaveText("Live");
    await page
      .getByLabel("Message", { exact: true })
      .fill("A draft worth keeping");
    await page.reload();
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
      "A draft worth keeping",
    );
    await page
      .getByLabel("Message", { exact: true })
      .fill("Hello from a little blue world");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const url = page.url();
    await peer.goto("/messages");
    await peer.getByRole("button", { name: /^requests/ }).click();
    await peer.locator(".conversation-row").filter({ hasText: alice }).click();
    await expect(peer.getByRole("log")).toContainText(
      "Hello from a little blue world",
    );
    await peer.getByRole("button", { name: "Accept conversation" }).click();
    await peer
      .getByRole("button", { name: "Jump to unread", exact: true })
      .click();
    await expect(
      peer.getByText("Unread messages", { exact: true }),
    ).toBeVisible();
    await expect(peer.getByLabel("Message", { exact: true })).toBeEnabled();
    await peer.getByLabel("Message", { exact: true }).fill("Hello back, live!");
    await peer
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.getByRole("log")).toContainText("Hello back, live!");
    const duplicates = await page.evaluate(async () => {
      const session = (await (await fetch("/api/auth/session/")).json()).data;
      const conversation = location.pathname.split("/").pop();
      const body = JSON.stringify({
        text: "Concurrent retry saved once",
        client_id: crypto.randomUUID(),
      });
      return await Promise.all(
        [1, 2, 3].map(async () => {
          const r = await fetch(
            `/api/chat/conversations/${conversation}/messages/`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": session.csrfToken,
              },
              body,
            },
          );
          return { status: r.status, id: (await r.json()).data?.id };
        }),
      );
    });
    expect(duplicates.every((r) => [200, 201].includes(r.status))).toBeTruthy();
    expect(new Set(duplicates.map((r) => r.id)).size).toBe(1);
    await page.route("**/api/chat/conversations/*/messages/", async (route) => {
      if (route.request().method() === "POST") {
        await route.fetch();
        await route.abort("failed");
        await page.unroute("**/api/chat/conversations/*/messages/");
      } else await route.continue();
    });
    await page
      .getByLabel("Message", { exact: true })
      .fill("Saved despite a lost response");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry send", exact: true }),
    ).toBeEnabled();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Retry send", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Retry send", exact: true }).click();
    await expect(
      page
        .locator(".message-bubble")
        .filter({ hasText: "Saved despite a lost response" }),
    ).toHaveCount(1);
    await page
      .getByLabel("Message", { exact: true })
      .fill("A private blue image");
    await page
      .getByLabel("Attach image", { exact: true })
      .setInputFiles(resolve("e2e/fixtures/blue.png"));
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const image = peer.getByRole("img", { name: "Shared chat image" });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    const imageURL = await image.getAttribute("src");
    const anonymous = await browser.newContext();
    expect(
      (
        await anonymous.request.get(`http://127.0.0.1:5174${imageURL}`)
      ).status(),
    ).toBe(401);
    await anonymous.close();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await page
      .getByRole("button", { name: "Shared photos & pins", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: "Shared photo", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pins", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Nothing shared here yet" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Photos", exact: true }).click();
    await page
      .getByRole("button", { name: "Show in conversation", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("img", { name: "Shared chat image" }),
    ).toBeVisible();
    const first = page
      .locator(".chat-message")
      .filter({ hasText: "Hello from a little blue world" });
    await first.getByLabel("Message actions").click();
    await first.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Message", { exact: true })
      .fill("Edited hello");
    await page.getByRole("button", { name: "Save edit" }).click();
    await expect(peer.getByRole("log")).toContainText("Edited hello");
    const edited = peer
      .locator(".chat-message")
      .filter({ hasText: "Edited hello" });
    await edited.locator("summary").click();
    await edited.getByRole("button", { name: "React ❤️", exact: true }).click();
    await expect(page.getByLabel("Reactions").first()).toContainText("❤️");
    await edited.getByLabel("Message actions").click();
    await edited.getByRole("button", { name: "Reply", exact: true }).click();
    await peer
      .getByLabel("Message", { exact: true })
      .fill("A threaded thought");
    await peer
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.locator("blockquote")).toContainText("Edited hello");
    await page.reload();
    await expect(page.getByRole("log")).toContainText("A threaded thought");
    await page
      .getByRole("button", { name: "Search this conversation" })
      .click();
    await page.getByLabel("Search messages").fill("private blue");
    await expect(page.getByRole("log")).toContainText("A private blue image");
    await expect(page.getByRole("log")).not.toContainText("A threaded thought");
    await page
      .getByRole("button", { name: "Jump to latest", exact: true })
      .click();
    await expect(page.getByRole("log")).toContainText("A threaded thought");
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
    const composerBox = await page
      .getByLabel("Message", { exact: true })
      .boundingBox();
    expect(composerBox).not.toBeNull();
    expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    await page.screenshot({
      path: `../artifacts/chat-${info.project.name}.png`,
    });
    if (info.project.name === "mobile")
      await page.getByRole("link", { name: "Back to inbox" }).click();
    await page
      .getByRole("button", { name: "New conversation", exact: true })
      .first()
      .click();
    await page.getByLabel("Group conversation").check();
    await page
      .getByLabel("Group name", { exact: true })
      .fill("Little blue club");
    await page.getByLabel("Find people").fill(bob.slice(0, -3));
    await page
      .getByRole("button", { name: `Choose @${bob}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start conversation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Little blue club" }),
    ).toBeVisible();
    await page
      .getByLabel("Message", { exact: true })
      .fill("Welcome to our group");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await peer.goto("/messages");
    await peer.getByRole("button", { name: /^requests/ }).click();
    await peer
      .locator(".conversation-row")
      .filter({ hasText: "Little blue club" })
      .click();
    await peer.getByRole("button", { name: "Accept conversation" }).click();
    await expect(peer.getByRole("log")).toContainText("Welcome to our group");
    await peer.goto(url);
    await peer.getByRole("button", { name: "Details", exact: true }).click();
    await peer.getByRole("button", { name: "Block person" }).click();
    await page.goto(url);
    await expect(page.getByLabel("Message", { exact: true })).toBeDisabled();
    if (info.project.name === "mobile")
      await peer.getByRole("link", { name: "Back to inbox" }).click();
    await peer.getByRole("button", { name: "Privacy", exact: true }).click();
    await peer.getByRole("button", { name: "Unblock", exact: true }).click();
    await peer.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByLabel("Message", { exact: true })).toBeEnabled();
    const imageMessage = page
      .locator(".chat-message")
      .filter({ hasText: "A private blue image" });
    await imageMessage.getByLabel("Message actions").click();
    await page
      .locator(".chat-message")
      .filter({ hasText: "A private blue image" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Delete message", exact: true })
      .click();
    if (info.project.name === "mobile") await peer.goto(url);
    await expect(
      peer.getByRole("img", { name: "Shared chat image" }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await peerContext.close();
  }
});
