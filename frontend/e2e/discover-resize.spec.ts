import { test, expect } from "@playwright/test";

test.skip(
  process.env.BEHTREST_E2E_PREVIEW !== "1",
  "Use the isolated preview test database.",
);

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`Discover stays within the viewport during resize (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1536, height: 768 });
    await page.goto("/login");
    await page.getByRole("button", { name: "Explore as a guest" }).click();
    await expect(page.locator(".feed-pin").first()).toBeVisible();
    await page.waitForTimeout(300);
    for (const width of [1440, 1366, 1280, 1100, 1024, 900, 768, 375, 1440]) {
      await page.setViewportSize({ width, height: 768 });
      const overflow = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let frame = 0;
            let max = 0;
            function sample() {
              max = Math.max(
                max,
                document.documentElement.scrollWidth -
                  document.documentElement.clientWidth,
              );
              if (++frame < 24) requestAnimationFrame(sample);
              else resolve(max);
            }
            sample();
          }),
      );
      expect(
        overflow,
        `horizontal overflow during resize to ${width}px`,
      ).toBeLessThanOrEqual(1);
    }
    if (reducedMotion === "no-preference") {
      await page.evaluate(() => window.dispatchEvent(new Event("owl-flight")));
      await expect(page.locator(".owl-flight")).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let max = 0;
            const end = performance.now() + 1900;
            function sample() {
              max = Math.max(
                max,
                document.documentElement.scrollWidth -
                  document.documentElement.clientWidth,
              );
              if (performance.now() < end) requestAnimationFrame(sample);
              else resolve(max);
            }
            sample();
          }),
      );
      expect(
        overflow,
        "offscreen decorative flight must not widen the document",
      ).toBeLessThanOrEqual(1);
    }
  });
}
