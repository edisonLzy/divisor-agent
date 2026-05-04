import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// vi.hoisted() ensures these are available when vi.mock is hoisted
const {
  mockReturning,
  mockWhere,
  mockValues,
  mockSet,
  mockSelect,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockExecute,
} = vi.hoisted(() => {
  const mockReturning: Mock = vi.fn();
  const mockWhere: Mock = vi.fn(() => ({ returning: mockReturning }));
  const mockValues: Mock = vi.fn(() => ({ returning: mockReturning, where: mockWhere }));
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve([])),
      orderBy: vi.fn(() => Promise.resolve([])),
    })),
  }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));
  const mockDelete = vi.fn(() => ({ where: mockWhere }));
  const mockExecute = vi.fn();

  return {
    mockReturning,
    mockWhere,
    mockValues,
    mockSet,
    mockSelect,
    mockInsert,
    mockUpdate,
    mockDelete,
    mockExecute,
  };
});

vi.mock("../../../src/db/index.js", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    execute: mockExecute,
  },
}));

// Now import the service (after mock is set up)
import {
  appendEntry,
  buildContext,
  createSession,
  deleteSession,
  getBranch,
  getChildren,
  getEntries,
  getEntry,
  getSession,
  listSessions,
  renameSession,
  rewind,
  setLeaf,
} from "../../../src/domain/sessions/service.js";

// ── Test data ───────────────────────────────────────────────────────────────

const mockSession = {
  id: "session-1",
  name: "Test Session",
  cwd: "/test",
  parentSessionId: null,
  leafEntryId: "entry-2",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const mockEntry = {
  id: "entry-1",
  sessionId: "session-1",
  parentId: null,
  type: "message",
  timestamp: new Date("2025-01-01"),
  data: { role: "user", content: "Hello" },
};

const mockEntry2 = {
  id: "entry-2",
  sessionId: "session-1",
  parentId: "entry-1",
  type: "message",
  timestamp: new Date("2025-01-02"),
  data: { role: "assistant", content: "Hi there" },
};

// ── Session CRUD Tests ──────────────────────────────────────────────────────

describe("Sessions Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSession", () => {
    it("should create a session with default values", async () => {
      mockReturning.mockResolvedValue([mockSession]);

      const result = await createSession({});

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "",
          cwd: "",
          parentSessionId: null,
        }),
      );
      expect(result).toEqual(mockSession);
    });

    it("should create a session with custom values", async () => {
      mockReturning.mockResolvedValue([mockSession]);

      await createSession({
        name: "My Session",
        cwd: "/work",
        parentSessionId: "parent-1",
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My Session",
          cwd: "/work",
          parentSessionId: "parent-1",
        }),
      );
    });

    it("should create a session with explicit id", async () => {
      mockReturning.mockResolvedValue([mockSession]);

      await createSession({ id: "custom-id" });

      expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ id: "custom-id" }));
    });
  });

  describe("listSessions", () => {
    it("should list sessions ordered by updatedAt desc", async () => {
      const mockFrom = { orderBy: vi.fn().mockResolvedValue([mockSession]) };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockFrom) });

      const result = await listSessions();

      expect(result).toEqual([mockSession]);
      expect(mockSelect).toHaveBeenCalled();
    });
  });

  describe("getSession", () => {
    it("should return a session by id", async () => {
      const mockWhereFn = vi.fn().mockResolvedValue([mockSession]);
      const mockFrom = { where: mockWhereFn };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockFrom) });

      const result = await getSession("session-1");

      expect(result).toEqual(mockSession);
    });

    it("should return null when session not found", async () => {
      const mockWhereFn = vi.fn().mockResolvedValue([]);
      const mockFrom = { where: mockWhereFn };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockFrom) });

      const result = await getSession("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("renameSession", () => {
    it("should rename a session", async () => {
      mockWhere.mockResolvedValue(undefined);

      await renameSession("session-1", "New Name");

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ name: "New Name" }));
    });
  });

  describe("deleteSession", () => {
    it("should delete a session", async () => {
      mockReturning.mockResolvedValue(undefined);

      await deleteSession("session-1");

      expect(mockDelete).toHaveBeenCalled();
    });
  });

  // ── Entry CRUD Tests ─────────────────────────────────────────────────────

  describe("appendEntry", () => {
    it("should append a message entry", async () => {
      mockReturning.mockResolvedValue([mockEntry]);
      mockWhere.mockResolvedValue(undefined);

      const result = await appendEntry({
        sessionId: "session-1",
        parentId: null,
        type: "message",
        data: { role: "user", content: "Hello" },
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          parentId: null,
          type: "message",
          data: { role: "user", content: "Hello" },
        }),
      );
      expect(result.id).toBe("entry-1");
      expect(result.type).toBe("message");
    });

    it("should append a model_change entry", async () => {
      const modelEntry = {
        ...mockEntry,
        id: "entry-model",
        type: "model_change",
        data: { provider: "anthropic", modelId: "claude-sonnet-4" },
      };
      mockReturning.mockResolvedValue([modelEntry]);
      mockWhere.mockResolvedValue(undefined);

      const result = await appendEntry({
        sessionId: "session-1",
        parentId: "entry-1",
        type: "model_change",
        data: { provider: "anthropic", modelId: "claude-sonnet-4" },
      });

      expect(result.type).toBe("model_change");
      expect(result.data).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4" });
    });

    it("should update session leafEntryId after append", async () => {
      mockReturning.mockResolvedValue([mockEntry]);
      mockWhere.mockResolvedValue(undefined);

      await appendEntry({
        sessionId: "session-1",
        parentId: null,
        type: "message",
        data: { role: "user", content: "Hello" },
      });

      // Second call to mockUpdate is the leafEntryId update
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ leafEntryId: "entry-1" }));
    });
  });

  describe("getEntry", () => {
    it("should return an entry by id", async () => {
      const mockWhereFn = vi.fn().mockResolvedValue([mockEntry]);
      const mockFrom = { where: mockWhereFn };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockFrom) });

      const result = await getEntry("entry-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("entry-1");
      expect(result!.type).toBe("message");
    });

    it("should return null when entry not found", async () => {
      const mockWhereFn = vi.fn().mockResolvedValue([]);
      const mockFrom = { where: mockWhereFn };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockFrom) });

      const result = await getEntry("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getEntries", () => {
    it("should return all entries for a session ordered by timestamp", async () => {
      const mockOrderBy = vi.fn().mockResolvedValue([mockEntry, mockEntry2]);
      const mockWhereFn = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = { where: mockWhereFn };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockFrom) });

      const result = await getEntries("session-1");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("entry-1");
      expect(result[1].id).toBe("entry-2");
    });
  });

  // ── Tree Operations Tests ─────────────────────────────────────────────────

  describe("getBranch", () => {
    it("should return branch path using recursive CTE", async () => {
      // Mock session lookup (for leafEntryId)
      const mockSessionWhere = vi.fn().mockResolvedValue([mockSession]);
      const mockSessionFrom = { where: mockSessionWhere };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockSessionFrom) });

      mockExecute.mockResolvedValue([
        {
          id: "entry-1",
          session_id: "session-1",
          parent_id: null,
          type: "message",
          timestamp: new Date("2025-01-01"),
          data: JSON.stringify({ role: "user", content: "Hello" }),
        },
        {
          id: "entry-2",
          session_id: "session-1",
          parent_id: "entry-1",
          type: "message",
          timestamp: new Date("2025-01-02"),
          data: JSON.stringify({ role: "assistant", content: "Hi" }),
        },
      ]);

      const result = await getBranch("session-1", "entry-2");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("entry-1");
      expect(result[1].id).toBe("entry-2");
      expect(mockExecute).toHaveBeenCalled();
    });

    it("should use session leafEntryId when no leafId provided", async () => {
      const mockSessionWhere = vi.fn().mockResolvedValue([mockSession]);
      const mockSessionFrom = { where: mockSessionWhere };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockSessionFrom) });
      mockExecute.mockResolvedValue([]);

      await getBranch("session-1");

      expect(mockSelect).toHaveBeenCalled();
    });

    it("should return empty array when session has no leaf", async () => {
      const sessionNoLeaf = { ...mockSession, leafEntryId: null };
      const mockSessionWhere = vi.fn().mockResolvedValue([sessionNoLeaf]);
      const mockSessionFrom = { where: mockSessionWhere };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockSessionFrom) });

      const result = await getBranch("session-1");

      expect(result).toEqual([]);
    });
  });

  describe("buildContext", () => {
    it("should collect messages and model info from branch", async () => {
      const mockSessionWhere = vi.fn().mockResolvedValue([mockSession]);
      const mockSessionFrom = { where: mockSessionWhere };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockSessionFrom) });

      mockExecute.mockResolvedValue([
        {
          id: "entry-1",
          session_id: "session-1",
          parent_id: null,
          type: "message",
          timestamp: new Date("2025-01-01"),
          data: JSON.stringify({ role: "user", content: "Hello" }),
        },
        {
          id: "entry-model",
          session_id: "session-1",
          parent_id: "entry-1",
          type: "model_change",
          timestamp: new Date("2025-01-01"),
          data: JSON.stringify({ provider: "anthropic", modelId: "claude-sonnet-4" }),
        },
        {
          id: "entry-2",
          session_id: "session-1",
          parent_id: "entry-model",
          type: "message",
          timestamp: new Date("2025-01-02"),
          data: JSON.stringify({ role: "assistant", content: "Hi" }),
        },
      ]);

      const result = await buildContext("session-1", "entry-2");

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[1].role).toBe("assistant");
      expect(result.model).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4" });
    });

    it("should return empty context when no entries", async () => {
      const mockSessionWhere = vi.fn().mockResolvedValue([mockSession]);
      const mockSessionFrom = { where: mockSessionWhere };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockSessionFrom) });
      mockExecute.mockResolvedValue([]);

      const result = await buildContext("session-1", "entry-1");

      expect(result.messages).toEqual([]);
      expect(result.model).toBeNull();
    });
  });

  describe("getChildren", () => {
    it("should return direct children of an entry", async () => {
      const mockOrderBy = vi.fn().mockResolvedValue([mockEntry2]);
      const mockWhereFn = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = { where: mockWhereFn };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockFrom) });

      const result = await getChildren("entry-1");

      expect(result).toHaveLength(1);
      expect(result[0].parentId).toBe("entry-1");
    });
  });

  // ── Branch & Rewind Tests ─────────────────────────────────────────────────

  describe("setLeaf", () => {
    it("should move leaf pointer to specified entry", async () => {
      const mockEntryWhere = vi.fn().mockResolvedValue([mockEntry]);
      const mockEntryFrom = { where: mockEntryWhere };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockEntryFrom) });
      mockWhere.mockResolvedValue(undefined);

      await setLeaf("session-1", "entry-1");

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ leafEntryId: "entry-1" }));
    });

    it("should throw when entry not found", async () => {
      const mockEntryWhere = vi.fn().mockResolvedValue([]);
      const mockEntryFrom = { where: mockEntryWhere };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockEntryFrom) });

      await expect(setLeaf("session-1", "nonexistent")).rejects.toThrow(
        "Entry nonexistent not found in session session-1",
      );
    });

    it("should throw when entry belongs to different session", async () => {
      const wrongSessionEntry = { ...mockEntry, sessionId: "other-session" };
      const mockEntryWhere = vi.fn().mockResolvedValue([wrongSessionEntry]);
      const mockEntryFrom = { where: mockEntryWhere };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockEntryFrom) });

      await expect(setLeaf("session-1", "entry-1")).rejects.toThrow(
        "Entry entry-1 not found in session session-1",
      );
    });
  });

  describe("rewind", () => {
    it("should move leaf to target entry", async () => {
      const mockEntryWhere = vi.fn().mockResolvedValue([mockEntry]);
      const mockEntryFrom = { where: mockEntryWhere };
      mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue(mockEntryFrom) });
      mockWhere.mockResolvedValue(undefined);

      await rewind("session-1", "entry-1");

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ leafEntryId: "entry-1" }));
    });
  });
});
