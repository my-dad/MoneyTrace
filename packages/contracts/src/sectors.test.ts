import { describe, expect, it } from "vitest";
import { INCOME_LABELS, INCOME_SOURCES, SECTOR_IDS, SECTOR_LABELS, foldSector, sectorSchema } from "./sectors";

describe("sectors", () => {
  it("lists the approved sectors in order, each with a label", () => {
    expect(SECTOR_IDS).toEqual(["food", "transport", "groceries", "shopping", "bills", "health", "education", "family", "rent", "other", "uncategorized"]);
    expect(SECTOR_LABELS.bills).toBe("Bills & recharge");
    expect(SECTOR_LABELS.uncategorized).toBe("Not sorted yet");
  });

  it("folds older categories into today's sectors", () => {
    expect(foldSector("eating-out")).toBe("food");
    expect(foldSector("mobile-recharge")).toBe("bills");
    expect(foldSector("uncategorized")).toBe("uncategorized");
    expect(foldSector("groceries")).toBe("groceries");
    expect(foldSector("weird")).toBe("other");
  });

  it("validates sector ids", () => {
    expect(sectorSchema.safeParse("food").success).toBe(true);
    expect(sectorSchema.safeParse("eating-out").success).toBe(false);
  });

  it("lists income sources with labels", () => {
    expect(INCOME_SOURCES).toEqual(["rent", "salary", "business", "gift", "other"]);
    expect(INCOME_LABELS.rent).toBe("House rent");
  });
});
