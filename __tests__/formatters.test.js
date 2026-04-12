import {
  addDays,
  computeStreak,
  formatTime,
  formatTotal,
  isSameDay,
  isToday,
  pad,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "../lib/formatters";

describe("pad", () => {
  it("pads single-digit numbers", () => {
    expect(pad(0)).toBe("00");
    expect(pad(5)).toBe("05");
    expect(pad(9)).toBe("09");
  });

  it("does not pad double-digit numbers", () => {
    expect(pad(10)).toBe("10");
    expect(pad(59)).toBe("59");
  });
});

describe("formatTime", () => {
  it("formats zero", () => {
    expect(formatTime(0)).toBe("00:00:00");
  });

  it("formats seconds only", () => {
    expect(formatTime(5000)).toBe("00:00:05");
    expect(formatTime(59000)).toBe("00:00:59");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(90000)).toBe("00:01:30");
    expect(formatTime(3599000)).toBe("00:59:59");
  });

  it("formats hours", () => {
    expect(formatTime(3600000)).toBe("01:00:00");
    expect(formatTime(7261000)).toBe("02:01:01");
  });
});

describe("formatTotal", () => {
  it("formats seconds when under a minute", () => {
    expect(formatTotal(0)).toBe("0s");
    expect(formatTotal(5000)).toBe("5s");
    expect(formatTotal(59000)).toBe("59s");
  });

  it("formats minutes when under an hour", () => {
    expect(formatTotal(60000)).toBe("1m");
    expect(formatTotal(90000)).toBe("1m");
    expect(formatTotal(3540000)).toBe("59m");
  });

  it("formats hours and minutes", () => {
    expect(formatTotal(3600000)).toBe("1h 0m");
    expect(formatTotal(5400000)).toBe("1h 30m");
    expect(formatTotal(7261000)).toBe("2h 1m");
  });
});

describe("date helpers", () => {
  it("startOfDay returns midnight", () => {
    const d = new Date(2024, 5, 15, 14, 30, 0);
    const sod = startOfDay(d);
    expect(sod.getHours()).toBe(0);
    expect(sod.getMinutes()).toBe(0);
    expect(sod.getDate()).toBe(15);
  });

  it("startOfWeek returns Monday", () => {
    // June 15, 2024 is a Saturday
    const d = new Date(2024, 5, 15);
    const sow = startOfWeek(d);
    expect(sow.getDay()).toBe(1); // Monday
    expect(sow.getDate()).toBe(10);
  });

  it("startOfMonth returns the 1st", () => {
    const d = new Date(2024, 5, 15);
    expect(startOfMonth(d).getDate()).toBe(1);
  });

  it("startOfYear returns Jan 1", () => {
    const d = new Date(2024, 5, 15);
    const soy = startOfYear(d);
    expect(soy.getMonth()).toBe(0);
    expect(soy.getDate()).toBe(1);
  });

  it("addDays adds/subtracts days", () => {
    const d = new Date(2024, 0, 15);
    expect(addDays(d, 3).getDate()).toBe(18);
    expect(addDays(d, -5).getDate()).toBe(10);
  });

  it("isSameDay compares dates ignoring time", () => {
    const a = new Date(2024, 5, 15, 10, 0);
    const b = new Date(2024, 5, 15, 22, 0);
    const c = new Date(2024, 5, 16, 10, 0);
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });

  it("isToday returns true for today's ISO string", () => {
    expect(isToday(new Date().toISOString())).toBe(true);
    expect(isToday("2020-01-01T00:00:00.000Z")).toBe(false);
  });
});

describe("computeStreak", () => {
  it("returns 0 for no sessions", () => {
    expect(computeStreak([])).toBe(0);
  });

  it("returns 0 for sessions too short (under 60s)", () => {
    const sessions = [
      { ms: 30000, endedAt: new Date().toISOString() },
    ];
    expect(computeStreak(sessions)).toBe(0);
  });

  it("returns 1 for today only", () => {
    const sessions = [
      { ms: 120000, endedAt: new Date().toISOString() },
    ];
    expect(computeStreak(sessions)).toBe(1);
  });

  it("counts consecutive days", () => {
    const today = startOfDay(new Date());
    const sessions = [
      { ms: 120000, endedAt: today.toISOString() },
      { ms: 120000, endedAt: addDays(today, -1).toISOString() },
      { ms: 120000, endedAt: addDays(today, -2).toISOString() },
    ];
    expect(computeStreak(sessions)).toBe(3);
  });

  it("breaks streak on gap", () => {
    const today = startOfDay(new Date());
    const sessions = [
      { ms: 120000, endedAt: today.toISOString() },
      // skip yesterday
      { ms: 120000, endedAt: addDays(today, -2).toISOString() },
    ];
    expect(computeStreak(sessions)).toBe(1);
  });
});
