import { expect, test } from "@playwright/test";

test.skip(
  process.env.BEHTREST_E2E_PREVIEW !== "1",
  "Disposable preview database only.",
);

for (const width of [375, 768, 1440]) {
  test(`Message notification controls and profile link at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/login");
    await page.getByRole("button", { name: "Explore as a guest" }).click();
    await expect(page.locator(".feed-pin").first()).toBeVisible();
    const pin = await page.locator(".pin-open").first().getAttribute("href");
    const target = await page.evaluate(async (path) => {
      const session = (await (await fetch("/api/auth/session/")).json()).data;
      const post = (
        await (await fetch(`/api/posts/${path!.split("/").pop()}/`)).json()
      ).data;
      const conversation = (
        await (
          await fetch("/api/chat/conversations/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRFToken": session.csrfToken,
            },
            body: JSON.stringify({ username: post.owner.username }),
          })
        ).json()
      ).data;
      return { id: conversation.id, username: post.owner.username };
    }, pin);
    await page.goto("/messages");
    const button = page.getByRole("button", {
      name: "Enable notifications",
      exact: true,
    });
    await expect(button).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    // Simulate a device without Web Push: keep the opt-in actionable and explanatory.
    await page.evaluate(() =>
      Object.defineProperty(window, "PushManager", {
        value: undefined,
        configurable: true,
      }),
    );
    await button.click();
    await expect(
      page.locator(".push-notifications [role=status]"),
    ).not.toHaveText("");
    // Exercise opt-in/preferences without contacting a real device push provider.
    await page.route("**/api/push/subscriptions/**", async (route) => {
      await route.fulfill({
        json: {
          data:
            route.request().method() === "GET"
              ? {
                  enabled: true,
                  public_key: btoa("x".repeat(65)),
                  preferences: null,
                }
              : { enabled: true },
        },
      });
    });
    await page.evaluate(() => {
      const sub = {
        endpoint: "https://fcm.googleapis.com/fcm/send/e2e",
        toJSON: () => ({
          endpoint: "https://fcm.googleapis.com/fcm/send/e2e",
          keys: { p256dh: "test", auth: "test" },
        }),
        unsubscribe: async () => true,
      };
      let subscribed = false;
      Object.defineProperty(navigator, "standalone", {
        value: true,
        configurable: true,
      });
      const registration = {
        pushManager: {
          getSubscription: async () => (subscribed ? sub : null),
          subscribe: async () => {
            subscribed = true;
            return sub;
          },
        },
      };
      Object.defineProperty(window, "PushManager", {
        value: class {},
        configurable: true,
      });
      Object.defineProperty(window, "Notification", {
        value: {
          permission: "granted",
          requestPermission: async () => "granted",
        },
        configurable: true,
      });
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          register: async () => registration,
          ready: Promise.resolve(registration),
        },
        configurable: true,
      });
    });
    await button.click();
    const enabled = page.getByRole("button", {
      name: "Notifications enabled",
      exact: true,
    });
    await expect(enabled).toBeVisible();
    await enabled.click();
    const dialog = page.getByRole("dialog", {
      name: "Notifications on this device",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const pins = dialog.getByRole("switch", {
      name: "New posts from people you follow",
    });
    await expect(pins).toHaveAttribute("aria-checked", "false");
    await pins.click();
    await expect(pins).toHaveAttribute("aria-checked", "true");
    expect(
      await dialog.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await enabled.click();
    await dialog
      .getByRole("button", { name: "Disable on this device", exact: true })
      .click();
    await expect(button).toBeVisible();
    await page.goto(`/messages/${target.id}`);
    const profile = page.locator(".room-heading .chat-profile-link");
    await expect(profile).toHaveAttribute("href", `/u/${target.username}`);
    await profile.click();
    await expect(page).toHaveURL(new RegExp(`/u/${target.username}$`));
    await expect(page.locator("main")).toBeVisible();
    const worker = await page.request.get("/sw.js");
    expect(worker.headers()["content-type"]).toContain("javascript");
    expect(await worker.text()).toContain('self.addEventListener("push"');
    const manifest = await page.request.get("/manifest.webmanifest");
    expect((await manifest.json()).display).toBe("standalone");
  });
}
