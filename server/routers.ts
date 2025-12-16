import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { deleteEventsByUser, getEventsByUser, insertEvents } from "./db";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  events: router({
    upload: protectedProcedure
      .input(
        z.object({
          events: z.array(
            z.object({
              timestamp: z.string(),
              latitude: z.string(),
              longitude: z.string(),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const eventList = input.events.map((event) => ({
          userId,
          timestamp: new Date(event.timestamp),
          latitude: event.latitude,
          longitude: event.longitude,
        }));

        await insertEvents(eventList);

        return {
          success: true,
          count: eventList.length,
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user.id;
      const events = await getEventsByUser(userId);
      return events;
    }),

    clear: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user.id;
      await deleteEventsByUser(userId);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
