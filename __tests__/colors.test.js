import { colorForTask, colorForUser, taskColorPalette } from "../lib/colors";

describe("colorForTask", () => {
  it("returns a color from the palette", () => {
    const color = colorForTask("My task");
    expect(taskColorPalette).toContain(color);
  });

  it("returns consistent color for same input", () => {
    expect(colorForTask("Reading")).toBe(colorForTask("Reading"));
  });

  it("returns default for empty input", () => {
    expect(colorForTask("")).toBe(taskColorPalette[0]);
    expect(colorForTask(null)).toBe(taskColorPalette[0]);
  });

  it("is case-insensitive", () => {
    expect(colorForTask("MyTask")).toBe(colorForTask("mytask"));
  });
});

describe("colorForUser", () => {
  it("returns a color from the palette", () => {
    const color = colorForUser({ id: "user123", email: "a@b.com" });
    expect(taskColorPalette).toContain(color);
  });

  it("returns default for null user", () => {
    expect(colorForUser(null)).toBe(taskColorPalette[0]);
  });

  it("returns consistent color for same user", () => {
    const user = { id: "user123" };
    expect(colorForUser(user)).toBe(colorForUser(user));
  });
});
