/**
 * @jest-environment jsdom
 */

import { localAuthAdapter } from "../lib/auth";

// Mock localStorage
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

describe("localAuthAdapter", () => {
  describe("signup", () => {
    it("creates a user with hashed password", async () => {
      const { user } = await localAuthAdapter.signup("test@example.com", "password123", "Test User");
      expect(user.email).toBe("test@example.com");
      expect(user.displayName).toBe("Test User");
      expect(user.id).toBeDefined();
      expect(user.createdAt).toBeDefined();
      // Password should not be on the returned user
      expect(user.password).toBeUndefined();
      expect(user.passwordHash).toBeUndefined();

      // Stored record should have passwordHash, not plaintext password
      const users = JSON.parse(store["alltime.users.v1"]);
      expect(users["test@example.com"].passwordHash).toBeDefined();
      expect(users["test@example.com"].password).toBeUndefined();
    });

    it("throws on empty email", async () => {
      await expect(localAuthAdapter.signup("", "pass", "")).rejects.toThrow("Email is required");
    });

    it("throws on short password", async () => {
      await expect(localAuthAdapter.signup("a@b.com", "ab", "")).rejects.toThrow("at least 4");
    });

    it("throws on duplicate email", async () => {
      await localAuthAdapter.signup("dup@example.com", "pass1234", "");
      await expect(localAuthAdapter.signup("dup@example.com", "pass5678", "")).rejects.toThrow("already exists");
    });

    it("uses email prefix as default display name", async () => {
      const { user } = await localAuthAdapter.signup("jane@example.com", "pass1234", "");
      expect(user.displayName).toBe("jane");
    });
  });

  describe("login", () => {
    it("logs in with correct password", async () => {
      await localAuthAdapter.signup("user@test.com", "mypass123", "User");
      await localAuthAdapter.logout();
      const { user } = await localAuthAdapter.login("user@test.com", "mypass123");
      expect(user.email).toBe("user@test.com");
    });

    it("rejects wrong password", async () => {
      await localAuthAdapter.signup("user2@test.com", "correct", "User");
      await localAuthAdapter.logout();
      await expect(localAuthAdapter.login("user2@test.com", "wrong")).rejects.toThrow("Invalid");
    });

    it("rejects non-existent email", async () => {
      await expect(localAuthAdapter.login("nobody@test.com", "pass")).rejects.toThrow("Invalid");
    });

    it("auto-migrates plaintext passwords to hashed", async () => {
      // Simulate a legacy user with plaintext password
      store["alltime.users.v1"] = JSON.stringify({
        "legacy@test.com": {
          id: "u_legacy",
          email: "legacy@test.com",
          displayName: "Legacy",
          createdAt: "2024-01-01T00:00:00.000Z",
          password: "oldpass",
        },
      });

      const { user } = await localAuthAdapter.login("legacy@test.com", "oldpass");
      expect(user.email).toBe("legacy@test.com");

      // After login, password should be migrated to hash
      const users = JSON.parse(store["alltime.users.v1"]);
      expect(users["legacy@test.com"].passwordHash).toBeDefined();
      expect(users["legacy@test.com"].password).toBeUndefined();
    });
  });

  describe("logout", () => {
    it("clears current user", async () => {
      await localAuthAdapter.signup("out@test.com", "pass1234", "");
      expect(store["alltime.current_user.v1"]).toBeDefined();
      await localAuthAdapter.logout();
      expect(store["alltime.current_user.v1"]).toBeUndefined();
    });
  });

  describe("subscribe", () => {
    it("fires callback with current user", async () => {
      await localAuthAdapter.signup("sub@test.com", "pass1234", "Sub");
      const callback = jest.fn();
      const unsub = localAuthAdapter.subscribe(callback);
      // subscribe fires asynchronously
      await new Promise((r) => setTimeout(r, 10));
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ email: "sub@test.com" })
      );
      unsub();
    });

    it("fires callback with null when no user", async () => {
      const callback = jest.fn();
      const unsub = localAuthAdapter.subscribe(callback);
      await new Promise((r) => setTimeout(r, 10));
      expect(callback).toHaveBeenCalledWith(null);
      unsub();
    });
  });
});
