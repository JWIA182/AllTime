/**
 * @jest-environment jsdom
 */

// Test the localStorage sessions backend (non-Firebase path)

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

// Force non-Firebase path
jest.mock("../lib/firebase", () => ({
  firebaseEnabled: false,
  getFirebase: () => ({ app: null, auth: null, db: null }),
}));

const { subscribeSessions, addSession, removeSession, clearSessions } = require("../lib/sessions");

describe("sessions (localStorage backend)", () => {
  const userId = "test-user";

  it("starts with empty sessions", () => {
    const callback = jest.fn();
    const unsub = subscribeSessions(userId, callback);
    expect(callback).toHaveBeenCalledWith([]);
    unsub();
  });

  it("adds a session", async () => {
    const session = {
      task: "Reading",
      taskId: "t1",
      ms: 300000,
      endedAt: "2024-06-15T10:00:00.000Z",
    };
    const result = await addSession(userId, session);
    expect(result.id).toBeDefined();
    expect(result.task).toBe("Reading");
    expect(result.ms).toBe(300000);

    // Verify stored
    const stored = JSON.parse(store[`alltime.sessions.v1:${userId}`]);
    expect(stored).toHaveLength(1);
    expect(stored[0].task).toBe("Reading");
  });

  it("removes a session", async () => {
    const s1 = await addSession(userId, { task: "A", ms: 1000, endedAt: "2024-01-01T00:00:00Z" });
    // Small delay so Date.now() produces a different ID
    await new Promise((r) => setTimeout(r, 5));
    await addSession(userId, { task: "B", ms: 2000, endedAt: "2024-01-01T01:00:00Z" });

    await removeSession(userId, s1.id);
    const stored = JSON.parse(store[`alltime.sessions.v1:${userId}`]);
    expect(stored).toHaveLength(1);
    expect(stored[0].task).toBe("B");
  });

  it("clears all sessions", async () => {
    await addSession(userId, { task: "A", ms: 1000, endedAt: "2024-01-01T00:00:00Z" });
    await addSession(userId, { task: "B", ms: 2000, endedAt: "2024-01-01T01:00:00Z" });
    await clearSessions(userId);
    const stored = JSON.parse(store[`alltime.sessions.v1:${userId}`]);
    expect(stored).toHaveLength(0);
  });
});
