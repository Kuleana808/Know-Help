import { Request, Response, NextFunction } from "express";
import { db } from "../db/database";
import { s3Ops } from "./s3";

interface TierLimits {
  max_ventures: number;
  max_contacts: number;
  max_pack_installs: number;
  max_storage_mb: number;
}

const PRO_LIMITS: TierLimits = {
  max_ventures: 5,
  max_contacts: 500,
  max_pack_installs: 10,
  max_storage_mb: 100,
};

const TEAM_LIMITS: TierLimits = {
  max_ventures: 10,
  max_contacts: 2000,
  max_pack_installs: 25,
  max_storage_mb: 500,
};

function getLimits(tier: string): TierLimits {
  return tier === "team" ? TEAM_LIMITS : PRO_LIMITS;
}

/**
 * Check if user's subscription is active (not expired trial or canceled).
 */
export function requireActiveSubscription() {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isActive =
      user.subscription_status === "active" ||
      user.subscription_status === "trialing";

    // Check trial expiry
    if (user.subscription_status === "trialing" && user.trial_ends_at) {
      if (new Date(user.trial_ends_at) < new Date()) {
        return res.status(402).json({
          error: "Trial expired. Subscribe to continue.",
          upgrade_url: "/billing/subscribe",
        });
      }
    }

    if (!isActive) {
      return res.status(402).json({
        error: "Subscription required",
        upgrade_url: "/billing/subscribe",
      });
    }

    (req as any).limits = getLimits(user.subscription_tier);
    next();
  };
}

/**
 * Check a specific limit before allowing an action.
 */
export async function checkLimit(
  userId: string,
  limitType: "ventures" | "contacts" | "pack_installs",
  currentCount: number
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const user = db.prepare("SELECT subscription_tier FROM users WHERE id = ?").get(userId) as any;
  const limits = getLimits(user?.subscription_tier || "pro");

  let limit: number;
  switch (limitType) {
    case "ventures":
      limit = limits.max_ventures;
      break;
    case "contacts":
      limit = limits.max_contacts;
      break;
    case "pack_installs":
      limit = limits.max_pack_installs;
      break;
  }

  return {
    allowed: currentCount < limit,
    limit,
    current: currentCount,
  };
}

/**
 * Check team member limits (10 included, $5/mo each additional).
 */
export function checkTeamMemberLimit(teamId: string): {
  allowed: boolean;
  currentMembers: number;
  includedMembers: number;
} {
  const members = db
    .prepare("SELECT COUNT(*) as count FROM team_members WHERE team_id = ? AND status = 'active'")
    .get(teamId) as any;

  return {
    allowed: true, // Always allow, but charge for extra
    currentMembers: members?.count || 0,
    includedMembers: 10,
  };
}
