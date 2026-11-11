import { describe, expect, test } from "vitest";
import { cycleByKey, cycleForDate, cycleKeyForDate, formatCyclePeriod, formatPayDate, isDateInCycle, shiftCycle } from "@/lib/salary-cycle";

describe("monthly salary cycles, paid on the 10th of the next month", () => {
  test("October 2026 salary = 1–31 Oct 2026, paid 10 Nov 2026", () => {
    const c = cycleByKey("2026-10");
    expect(c).toEqual({ key: "2026-10", label: "October 2026", startDate: "2026-10-01", endDate: "2026-11-01", payDate: "2026-11-10" });
    expect(formatCyclePeriod(c)).toBe("01 OCT 2026 – 31 OCT 2026");
    expect(formatPayDate(c)).toBe("10 NOV 2026");
  });

  test("month lengths and the year boundary", () => {
    expect(formatCyclePeriod(cycleByKey("2026-11"))).toBe("01 NOV 2026 – 30 NOV 2026");
    expect(formatCyclePeriod(cycleByKey("2027-02"))).toBe("01 FEB 2027 – 28 FEB 2027");
    expect(formatCyclePeriod(cycleByKey("2028-02"))).toBe("01 FEB 2028 – 29 FEB 2028");
    expect(cycleByKey("2026-12")).toMatchObject({ endDate: "2027-01-01", payDate: "2027-01-10" });
  });

  test("start inclusive, end exclusive: every day belongs to exactly one month", () => {
    expect(cycleKeyForDate("2026-10-01")).toBe("2026-10");
    expect(cycleKeyForDate("2026-10-31")).toBe("2026-10");
    expect(cycleKeyForDate("2026-11-01")).toBe("2026-11");
    for (let t = Date.UTC(2026, 9, 1); t <= Date.UTC(2027, 2, 31); t += 86_400_000) {
      const day = new Date(t).toISOString().slice(0, 10);
      const owners = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"].filter((k) => isDateInCycle(day, cycleByKey(k)));
      expect(owners).toEqual([cycleKeyForDate(day)]);
    }
  });

  test("today (11 Nov 2026) is in the November cycle; October's salary was due yesterday", () => {
    const now = cycleForDate("2026-11-11");
    expect(now.label).toBe("November 2026");
    expect(cycleByKey(shiftCycle(now.key, -1)).payDate).toBe("2026-11-10");
  });

  test("navigation and a custom payday", () => {
    expect(shiftCycle("2026-01", -1)).toBe("2025-12");
    expect(shiftCycle("2026-12", 1)).toBe("2027-01");
    expect(cycleByKey("2026-10", 5).payDate).toBe("2026-11-05");
    expect(() => cycleByKey("2026-10", 31)).toThrow();
  });
});
