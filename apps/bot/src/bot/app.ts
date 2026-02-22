import { App, LogLevel } from "@slack/bolt";
import { getEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { workspaceAuthMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { handleMention } from "./handlers/mention.js";
import { handleSlashCommand } from "./handlers/slash.js";
import { handleMessageShortcut } from "./handlers/shortcut.js";
import { updateQueryFeedback } from "../lib/db/queries/query-logs.js";

let _app: App | null = null;

/**
 * Creates and configures the Bolt Slack app with Socket Mode.
 * Registers all middleware, event handlers, and action handlers.
 *
 * @returns Initialized Bolt App instance.
 */
export function createBoltApp(): App {
  if (_app) return _app;

  const env = getEnv();

  _app = new App({
    token: env.SLACK_BOT_TOKEN,
    signingSecret: env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: env.SLACK_APP_TOKEN,
    // Suppress Bolt's internal logger — we use Pino
    logLevel: LogLevel.ERROR,
    logger: {
      debug: (...msgs) => logger.debug(msgs),
      info: (...msgs) => logger.info(msgs),
      warn: (...msgs) => logger.warn(msgs),
      error: (...msgs) => logger.error(msgs),
      setLevel: () => undefined,
      getLevel: () => LogLevel.ERROR,
      setName: () => undefined,
    },
  });

  // Global middleware
  _app.use(workspaceAuthMiddleware);

  // @OpenEllie mentions in channels
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  _app.event("app_mention", rateLimitMiddleware as any, async (args) => handleMention(args as any));

  // /ellie slash command
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  _app.command("/ellie", rateLimitMiddleware as any, async (args) => handleSlashCommand(args as any));

  // Message shortcut: right-click → "Ask OpenEllie about this"
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  _app.shortcut("ask_openellie", handleMessageShortcut as any);

  // Feedback button actions
  _app.action("feedback_helpful", async ({ ack, action }) => {
    await ack();
    if (action.type === "button") {
      const queryLogId = action.value;
      if (queryLogId) {
        try {
          await updateQueryFeedback(queryLogId, true);
          logger.info({ queryLogId }, "Feedback recorded: helpful");
        } catch (error) {
          logger.error({ err: error, queryLogId }, "Failed to record helpful feedback");
        }
      }
    }
  });

  _app.action("feedback_not_helpful", async ({ ack, action }) => {
    await ack();
    if (action.type === "button") {
      const queryLogId = action.value;
      if (queryLogId) {
        try {
          await updateQueryFeedback(queryLogId, false);
          logger.info({ queryLogId }, "Feedback recorded: not helpful");
        } catch (error) {
          logger.error({ err: error, queryLogId }, "Failed to record not-helpful feedback");
        }
      }
    }
  });

  logger.info("Bolt app configured with Socket Mode");
  return _app;
}

/**
 * Returns the singleton Bolt App instance.
 *
 * @throws Error if createBoltApp() has not been called.
 */
export function getBoltApp(): App {
  if (!_app) {
    throw new Error("Bolt app not initialized. Call createBoltApp() first.");
  }
  return _app;
}
