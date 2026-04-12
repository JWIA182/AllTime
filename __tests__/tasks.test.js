/**
 * @jest-environment jsdom
 */

const store = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((k) => store[k] || null);
  jest.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => { store[k] = v; });
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation((k) => { delete store[k]; });
});

afterEach(() => {
  jest.restoreAllMocks();
});

jest.mock("../lib/firebase", () => ({
  firebaseEnabled: false,
  getFirebase: () => ({ app: null, auth: null, db: null }),
}));

const { subscribeTasks, addTask, updateTask, deleteTask } = require("../lib/tasks");

describe("tasks (localStorage backend)", () => {
  const userId = "test-user";

  it("starts with empty tasks", () => {
    const callback = jest.fn();
    const unsub = subscribeTasks(userId, callback);
    expect(callback).toHaveBeenCalledWith([]);
    unsub();
  });

  it("adds a task", async () => {
    const result = await addTask(userId, { name: "Reading", color: "#6b9e78" });
    expect(result.id).toBeDefined();
    expect(result.name).toBe("Reading");
    expect(result.color).toBe("#6b9e78");
    expect(result.createdAt).toBeDefined();
  });

  it("updates a task", async () => {
    const task = await addTask(userId, { name: "Old Name", color: "#6b9e78" });
    await updateTask(userId, task.id, { name: "New Name", color: "#5b8fb9" });

    const stored = JSON.parse(store[`alltime.tasks.v1:${userId}`]);
    const updated = stored.find((t) => t.id === task.id);
    expect(updated.name).toBe("New Name");
    expect(updated.color).toBe("#5b8fb9");
  });

  it("deletes a task", async () => {
    const task = await addTask(userId, { name: "To Delete", color: "#6b9e78" });
    await deleteTask(userId, task.id);

    const stored = JSON.parse(store[`alltime.tasks.v1:${userId}`]);
    expect(stored.find((t) => t.id === task.id)).toBeUndefined();
  });
});
