import { expect, test } from "@playwright/test";

test.describe("Dropdown overlays", () => {
  test("keeps disclosure dropdown menu inside the viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/playwright/dropdown-fixture.html");

    await page.getByRole("button", { name: "Native Keys" }).click();

    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Tauri Global Shortcut" }),
    ).toBeVisible();

    const bounds = await listbox.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
  });
});
