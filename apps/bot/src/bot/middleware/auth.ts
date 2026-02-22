import type { Middleware, AnyMiddlewareArgs } from "@slack/bolt";
import { getWorkspace } from "../../lib/db/queries/workspaces.js";
import { logger } from "../../lib/logger.js";
import { SlackError } from "../../lib/errors.js";

/**
 * Middleware that verifies the incoming Slack request belongs to the configured workspace.
 * For single-workspace mode, this validates the team_id matches the seeded workspace.
 *
 * In Socket Mode, Slack already handles token-level auth. This middleware adds
 * a workspace-level check to reject requests from unexpected workspaces.
 */
export const workspaceAuthMiddleware: Middleware<AnyMiddlewareArgs> = async ({
  payload,
  next,
}) => {
  try {
    // In Socket Mode, team_id is available on app_mention and message events
    const teamId =
      "team_id" in payload ? (payload as { team_id?: string }).team_id : undefined;

    if (teamId) {
      const workspace = await getWorkspace();

      if (!workspace) {
        logger.warn({ teamId }, "Received event before workspace was seeded");
        return; // Don't process — startup not complete
      }

      if (workspace.slackTeamId !== teamId) {
        logger.warn(
          { expected: workspace.slackTeamId, received: teamId },
          "Rejected event from unexpected workspace",
        );
        return; // Silently ignore — don't reveal workspace ID
      }
    }

    await next();
  } catch (error) {
    logger.error({ err: error }, "Workspace auth middleware error");
    throw new SlackError("Workspace authentication failed", error);
  }
};
