import { expect, type Page } from "@playwright/test";

export async function completeInterests(page: Page) {
  const dialog = page.getByRole("dialog", { name: "What inspires you?" });
  await expect(dialog).toBeVisible();
  const tags = dialog
    .getByRole("group", { name: "Choose interests" })
    .getByRole("button");
  for (let index = 0; index < 3; index++) await tags.nth(index).click();
  await dialog.getByRole("button", { name: "Save interests" }).click();
  await expect(dialog).not.toBeVisible();
}
