import { describe, expect, test } from "vitest";
import {
  calculateManualSalary,
  describeDuration,
  exactRupees,
  formatHMM,
  parseMonthlySalary,
  parseOvertimeDuration,
} from "@/lib/salary-calculator";
import { formatINR } from "@/lib/money";

const minutes = (s: string) => {
  const r = parseOvertimeDuration(s);
  if (!r.ok) throw new Error(r.error);
  return r.value.totalMinutes;
};
const calc = (salaryRupees: number, overtime: string) => calculateManualSalary(salaryRupees * 100, minutes(overtime));

describe("acceptance tests", () => {
  test("Test 1: ₹10,000 + 3.21 → 201 min, hourly ≈ ₹44.444444, OT ₹148.89, total ₹10,148.89", () => {
    expect(minutes("3.21")).toBe(201);
    const r = calc(10_000, "3.21");
    expect(exactRupees(r.hourlySalaryExact)).toBe("44.444444");
    expect(r.overtimeHoursExact).toBe("3.35");
    expect(formatINR(r.overtimePaymentPaise)).toBe("₹148.89");
    expect(formatINR(r.totalPaise)).toBe("₹10,148.89");
  });

  test("Test 2: ₹17,000 + 2.00 → OT ₹151.11, total ₹17,151.11", () => {
    const r = calc(17_000, "2.00");
    expect(formatINR(r.overtimePaymentPaise)).toBe("₹151.11");
    expect(formatINR(r.totalPaise)).toBe("₹17,151.11");
  });

  test("Test 3: ₹10,000 + 0.00 → OT ₹0.00, total ₹10,000.00", () => {
    const r = calc(10_000, "0.00");
    expect(formatINR(r.overtimePaymentPaise)).toBe("₹0.00");
    expect(formatINR(r.totalPaise)).toBe("₹10,000.00");
  });

  test("Test 4: ₹10,000 + 1.30 → 90 min, OT ₹66.67, total ₹10,066.67", () => {
    expect(minutes("1.30")).toBe(90);
    const r = calc(10_000, "1.30");
    expect(formatINR(r.overtimePaymentPaise)).toBe("₹66.67");
    expect(formatINR(r.totalPaise)).toBe("₹10,066.67");
  });

  test("Test 5: 3.75 is rejected (75 minutes is invalid)", () => {
    const r = parseOvertimeDuration("3.75");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/00 and 59/);
  });
});

describe("H.MM overtime parsing (minutes, not decimal hours)", () => {
  test.each([
    ["3.21", 201],
    ["2.45", 165],
    ["5.00", 300],
    ["1.59", 119],
    ["3:21", 201],
    ["0.30", 30],
    [".30", 30],
    [":45", 45],
    ["5", 300],
    ["12.05", 725],
    ["  3.21 ", 201],
    ["", 0],
    ["0", 0],
  ])("%j → %i minutes", (input, expected) => {
    expect(minutes(input)).toBe(expected);
  });

  test("3.21 is NOT 3.21 decimal hours (192.6 min)", () => {
    expect(minutes("3.21")).not.toBe(192.6);
  });

  test.each([
    ["3.75", /00 and 59/],
    ["1.60", /00 and 59/],
    ["3.5", /two digits/],
    ["3.123", /two digits/],
    ["3.", /Add the minutes/],
    ["-1.00", /negative/],
    ["abc", /hours.minutes/],
    ["3,21", /hours.minutes/],
    ["1.2.3", /hours.minutes/],
    ["745.00", /exceed/],
  ])("%j is rejected", (input, message) => {
    const r = parseOvertimeDuration(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  test("normalized descriptions", () => {
    expect(describeDuration(201)).toBe("3 hours 21 minutes");
    expect(describeDuration(60)).toBe("1 hour");
    expect(describeDuration(61)).toBe("1 hour 1 minute");
    expect(describeDuration(0)).toBe("0 minutes");
    expect(formatHMM(201)).toBe("3.21");
    expect(formatHMM(5)).toBe("0.05");
  });
});

describe("salary parsing and calculation", () => {
  test("salary input", () => {
    expect(parseMonthlySalary("17000")).toEqual({ ok: true, value: 1_700_000 });
    expect(parseMonthlySalary("₹17,000.50")).toEqual({ ok: true, value: 1_700_050 });
    expect(parseMonthlySalary("0")).toEqual({ ok: true, value: 0 });
    expect(parseMonthlySalary("").ok).toBe(false);
    expect(parseMonthlySalary("-5").ok).toBe(false);
    expect(parseMonthlySalary("10.123").ok).toBe(false);
    expect(parseMonthlySalary("1e5").ok).toBe(false);
  });

  test("daily = salary ÷ 30, hourly = daily ÷ 7.5 (₹10,000 → ₹333.33 / ₹44.44)", () => {
    const r = calc(10_000, "");
    expect(exactRupees(r.dailySalaryExact)).toBe("333.333333");
    expect(formatINR(r.dailySalaryPaise)).toBe("₹333.33");
    expect(formatINR(r.hourlySalaryPaise)).toBe("₹44.44");
  });

  test("no intermediate rounding: uses exact hourly, not the rounded ₹44.44", () => {
    // 44.44 × 3.35 would give ₹148.87; the exact rate gives ₹148.89.
    expect(calc(10_000, "3.21").overtimePaymentPaise).toBe(14889);
  });

  test("multiplier is applied to the hourly rate", () => {
    const r = calculateManualSalary(1_000_000, 201, { salaryDivisorDays: 30, standardWorkingHours: 7.5, overtimeMultiplier: 1.5 });
    expect(formatINR(r.overtimeHourlyRatePaise)).toBe("₹66.67");
    expect(formatINR(r.overtimePaymentPaise)).toBe("₹223.33");
  });

  test("negative or fractional inputs are refused by the calculation itself", () => {
    expect(() => calculateManualSalary(-1, 0)).toThrow();
    expect(() => calculateManualSalary(100, -5)).toThrow();
    expect(() => calculateManualSalary(100, 1.5)).toThrow();
  });

  test("zero salary gives zero everything", () => {
    expect(calculateManualSalary(0, 201)).toMatchObject({ overtimePaymentPaise: 0, totalPaise: 0 });
  });
});

describe("spec example: ₹17,000 default salary", () => {
  test("daily ₹566.6667, hourly ₹75.5556, 3.21 → 3.35 h → ₹253.11, total ₹17,253.11", () => {
    const r = calculateManualSalary(1_700_000, minutes("3.21"));
    expect(exactRupees(r.dailySalaryExact, 4)).toBe("566.6667");
    expect(exactRupees(r.hourlySalaryExact, 4)).toBe("75.5556");
    expect(r.overtimeMinutes).toBe(201);
    expect(r.overtimeHoursExact).toBe("3.35");
    expect(formatINR(r.overtimePaymentPaise)).toBe("₹253.11");
    expect(formatINR(r.totalPaise)).toBe("₹17,253.11");
  });

  test("3:21 is accepted too; minutes above 59 are rejected", () => {
    expect(minutes("3:21")).toBe(201);
    expect(parseOvertimeDuration("3.60").ok).toBe(false);
  });
});
