import { test, expect } from "@playwright/test";

test.skip(process.env.PROPOSAL_DESIGN_PREVIEW !== "1", "Use the dedicated config against a running development app.");

test("switches all three A4 concepts without reloading or changing the proposal", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let navigations = 0;
  const response = await page.goto("/dev/proposal");
  expect(response?.status()).toBe(200);
  const variants = [
    ["measured-space", "Measured Space"],
    ["quiet-monument", "Quiet Monument"],
    ["folded-plane", "Folded Plane"],
  ] as const;
  for (const [variant] of variants) {
    await expect(page.locator(`[data-proposal-design="${variant}"] canvas`)).toHaveCount(1);
  }
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
  const images: string[] = [];
  const switcher = page.getByRole("group", { name: "Proposal design variant" });
  for (const [variant, label] of variants) {
    const panel = page.locator(`[data-proposal-design="${variant}"]`);
    // Every design is prepared up front, including the currently inactive panels.
    await expect(panel.locator("canvas")).toHaveCount(1);
    await expect(panel.locator("[data-proposal-pages]")).toContainText("Дім у Львові");
    await switcher.getByRole("button", { name: label, exact: true }).click();
    await expect(switcher.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await expect(panel.locator("canvas")).toBeVisible();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    const text = (await panel.locator("[data-proposal-pages]").innerText()).replace(/\s+/g," ").replace(/\s+%/g,"%").replace(/\/\s+/g,"/");
    for (const value of ["№ 123", "Редакція 2", "01.10.2026", "Дім у Львові", "Лілія Коваль", "Львів, вул. Гіпсова, 12", "11 689,92", "264 м² × 49,2 USD/м²", "Знижка 10%", "−1 298,88 USD", "12 988,80 USD", "ПДВ 23% включено", "2 185,92 USD", "40%", "4 675,97 USD", "35%", "4 091,47 USD", "25%", "2 922,48 USD", "Площа попередня", "space-design.pro", "info@space-design.pro"]) {
      expect(text).toContain(value);
    }
    expect(text).not.toMatch(/Податок з доходу|Після податку|P&L/);
    const canvas = panel.locator("canvas");
    const ratio = await canvas.evaluate(el => el.getBoundingClientRect().width/el.getBoundingClientRect().height);
    expect(ratio).toBeCloseTo(210/297, 2);
    images.push(await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()));
    await panel.screenshot({ path: testInfo.outputPath(`${variant}.png`) });
  }
  expect(new Set(images).size).toBe(3);
  expect(navigations).toBe(0);
  await switcher.getByRole("button", { name: "Measured Space", exact: true }).click();
  await expect(page.locator('[data-proposal-design="measured-space"] canvas')).toBeVisible();
  expect(errors).toEqual([]);
});
