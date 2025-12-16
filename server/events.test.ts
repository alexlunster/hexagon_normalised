import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { deleteEventsByUser, getUserByOpenId, upsertUser } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 999,
    openId: "test-user-events",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("events router", () => {
  beforeEach(async () => {
    // Create test user and clean up test data before each test
    const ctx = createAuthContext();
    await upsertUser({
      openId: ctx.user!.openId,
      email: ctx.user!.email,
      name: ctx.user!.name,
      loginMethod: ctx.user!.loginMethod,
      role: ctx.user!.role,
    });
    const dbUser = await getUserByOpenId(ctx.user!.openId);
    if (dbUser) {
      await deleteEventsByUser(dbUser.id);
    }
  });

  it("uploads events successfully", async () => {
    const ctx = createAuthContext();
    const dbUser = await getUserByOpenId(ctx.user!.openId);
    if (dbUser) {
      ctx.user!.id = dbUser.id;
    }
    const caller = appRouter.createCaller(ctx);

    const testEvents = [
      {
        timestamp: new Date("2024-01-01T10:00:00Z").toISOString(),
        latitude: "40.7128",
        longitude: "-74.0060",
      },
      {
        timestamp: new Date("2024-01-01T11:00:00Z").toISOString(),
        latitude: "40.7580",
        longitude: "-73.9855",
      },
    ];

    const result = await caller.events.upload({ events: testEvents });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it("retrieves uploaded events", async () => {
    const ctx = createAuthContext();
    const dbUser = await getUserByOpenId(ctx.user!.openId);
    if (dbUser) {
      ctx.user!.id = dbUser.id;
    }
    const caller = appRouter.createCaller(ctx);

    const testEvents = [
      {
        timestamp: new Date("2024-01-01T10:00:00Z").toISOString(),
        latitude: "40.7128",
        longitude: "-74.0060",
      },
    ];

    await caller.events.upload({ events: testEvents });
    const events = await caller.events.list();

    expect(events.length).toBe(1);
    expect(events[0]?.latitude).toBe("40.7128");
    expect(events[0]?.longitude).toBe("-74.0060");
  });

  it("clears all events for a user", async () => {
    const ctx = createAuthContext();
    const dbUser = await getUserByOpenId(ctx.user!.openId);
    if (dbUser) {
      ctx.user!.id = dbUser.id;
    }
    const caller = appRouter.createCaller(ctx);

    const testEvents = [
      {
        timestamp: new Date("2024-01-01T10:00:00Z").toISOString(),
        latitude: "40.7128",
        longitude: "-74.0060",
      },
    ];

    await caller.events.upload({ events: testEvents });
    const result = await caller.events.clear();

    expect(result.success).toBe(true);

    const events = await caller.events.list();
    expect(events.length).toBe(0);
  });

  it("isolates events between different users", async () => {
    const ctx1 = createAuthContext();
    ctx1.user!.openId = "test-user-1001";
    await upsertUser({
      openId: ctx1.user!.openId,
      email: "user1@example.com",
      name: "User 1",
      loginMethod: "manus",
      role: "user",
    });
    const dbUser1 = await getUserByOpenId(ctx1.user!.openId);
    if (dbUser1) {
      ctx1.user!.id = dbUser1.id;
    }
    const caller1 = appRouter.createCaller(ctx1);

    const ctx2 = createAuthContext();
    ctx2.user!.openId = "test-user-1002";
    await upsertUser({
      openId: ctx2.user!.openId,
      email: "user2@example.com",
      name: "User 2",
      loginMethod: "manus",
      role: "user",
    });
    const dbUser2 = await getUserByOpenId(ctx2.user!.openId);
    if (dbUser2) {
      ctx2.user!.id = dbUser2.id;
    }
    const caller2 = appRouter.createCaller(ctx2);

    await caller1.events.upload({
      events: [
        {
          timestamp: new Date("2024-01-01T10:00:00Z").toISOString(),
          latitude: "40.7128",
          longitude: "-74.0060",
        },
      ],
    });

    await caller2.events.upload({
      events: [
        {
          timestamp: new Date("2024-01-01T11:00:00Z").toISOString(),
          latitude: "34.0522",
          longitude: "-118.2437",
        },
      ],
    });

    const events1 = await caller1.events.list();
    const events2 = await caller2.events.list();

    expect(events1.length).toBe(1);
    expect(events2.length).toBe(1);
    expect(events1[0]?.latitude).toBe("40.7128");
    expect(events2[0]?.latitude).toBe("34.0522");

    // Clean up
    await deleteEventsByUser(ctx1.user!.id);
    await deleteEventsByUser(ctx2.user!.id);
  });
});
