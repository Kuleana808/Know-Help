import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/database";
import { s3Ops, initUserKnowledge } from "./s3";
import { slugify } from "../utils/paths";
import { sendTeamInvitation } from "../payments/email";
import { checkTeamMemberLimit } from "./limits";

const router = Router();
const BASE_URL = process.env.BASE_URL || "https://know.help";

// ── RBAC permission check ───────────────────────────────────────────────────

type Role = "viewer" | "member" | "admin" | "owner";

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

function getTeamMember(teamId: string, userId: string): any {
  return db
    .prepare("SELECT * FROM team_members WHERE team_id = ? AND user_id = ? AND status = 'active'")
    .get(teamId, userId);
}

// ── Create team ─────────────────────────────────────────────────────────────

router.post("/teams/create", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Team name required" });

  const teamId = uuidv4();
  const slug = slugify(name);
  const s3Prefix = `teams/${teamId}/knowledge`;
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO teams (id, name, slug, owner_user_id, subscription_status, trial_ends_at, s3_prefix, created_at)
     VALUES (?, ?, ?, ?, 'trialing', ?, ?, ?)`
  ).run(teamId, name, slug, userId, trialEnds, s3Prefix, new Date().toISOString());

  // Add owner as team member
  db.prepare(
    `INSERT INTO team_members (team_id, user_id, role, invited_by, joined_at, status)
     VALUES (?, ?, 'owner', ?, ?, 'active')`
  ).run(teamId, userId, userId, new Date().toISOString());

  // Initialize team knowledge base
  await initUserKnowledge(s3Prefix);

  res.status(201).json({ team_id: teamId, slug, name });
});

// ── Create team from Pro (migration) ────────────────────────────────────────

router.post("/teams/create-from-pro", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Team name required" });

  const teamId = uuidv4();
  const slug = slugify(name);
  const teamPrefix = `teams/${teamId}/knowledge`;
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  // Create team
  db.prepare(
    `INSERT INTO teams (id, name, slug, owner_user_id, subscription_status, trial_ends_at, s3_prefix, created_at)
     VALUES (?, ?, ?, ?, 'trialing', ?, ?, ?)`
  ).run(teamId, name, slug, userId, trialEnds, teamPrefix, new Date().toISOString());

  db.prepare(
    `INSERT INTO team_members (team_id, user_id, role, invited_by, joined_at, status)
     VALUES (?, ?, 'owner', ?, ?, 'active')`
  ).run(teamId, userId, userId, new Date().toISOString());

  // Copy user's knowledge base to team
  if (user.s3_prefix) {
    const files = await s3Ops.list(user.s3_prefix);
    for (const file of files) {
      try {
        const content = await s3Ops.read(user.s3_prefix, file);
        await s3Ops.write(teamPrefix, file, content);
      } catch {
        // Skip files that can't be read
      }
    }
  }

  res.status(201).json({
    team_id: teamId,
    slug,
    message: "Team created. Your Pro knowledge base has been copied.",
  });
});

// ── Team members ────────────────────────────────────────────────────────────

router.get("/teams/:teamId/members", (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  const member = getTeamMember(req.params.teamId, userId);
  if (!member) return res.status(403).json({ error: "Not a team member" });

  const members = db
    .prepare(
      `SELECT tm.*, u.email FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = ? AND tm.status = 'active'
       ORDER BY tm.joined_at`
    )
    .all(req.params.teamId);

  const invitations = db
    .prepare(
      "SELECT * FROM team_invitations WHERE team_id = ? AND accepted_at IS NULL AND expires_at > ?"
    )
    .all(req.params.teamId, new Date().toISOString());

  res.json({ members, invitations });
});

// ── Invite member ───────────────────────────────────────────────────────────

router.post("/teams/:teamId/invite", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  const member = getTeamMember(req.params.teamId, userId);

  if (!member || !hasPermission(member.role, "admin")) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const inviteRole = role || "member";
  if (!["viewer", "member", "admin"].includes(inviteRole)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  // Check member limit
  const limitCheck = checkTeamMemberLimit(req.params.teamId);

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const invitationId = uuidv4();

  db.prepare(
    `INSERT INTO team_invitations (id, team_id, invited_email, role, invited_by, token, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(invitationId, req.params.teamId, email, inviteRole, userId, token, expiresAt);

  const team = db.prepare("SELECT name FROM teams WHERE id = ?").get(req.params.teamId) as any;
  const inviter = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as any;

  const joinUrl = `${BASE_URL}/join/${token}`;
  await sendTeamInvitation(email, team?.name || "Team", inviter?.email || "A teammate", joinUrl);

  res.json({
    success: true,
    message: `Invitation sent to ${email}`,
    extra_members: limitCheck.currentMembers >= limitCheck.includedMembers,
  });
});

// ── Accept invitation ───────────────────────────────────────────────────────

router.post("/teams/join/:token", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  const invitation = db
    .prepare("SELECT * FROM team_invitations WHERE token = ? AND accepted_at IS NULL")
    .get(req.params.token) as any;

  if (!invitation) {
    return res.status(404).json({ error: "Invalid or expired invitation" });
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return res.status(410).json({ error: "Invitation expired" });
  }

  // Add as team member
  db.prepare(
    `INSERT OR IGNORE INTO team_members (team_id, user_id, role, invited_by, joined_at, status)
     VALUES (?, ?, ?, ?, ?, 'active')`
  ).run(invitation.team_id, userId, invitation.role, invitation.invited_by, new Date().toISOString());

  // Mark invitation accepted
  db.prepare("UPDATE team_invitations SET accepted_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    invitation.id
  );

  res.json({
    success: true,
    team_id: invitation.team_id,
    role: invitation.role,
  });
});

// ── Remove member ───────────────────────────────────────────────────────────

router.delete("/teams/:teamId/members/:memberId", (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  const member = getTeamMember(req.params.teamId, userId);

  if (!member || !hasPermission(member.role, "admin")) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const target = getTeamMember(req.params.teamId, req.params.memberId);
  if (!target) return res.status(404).json({ error: "Member not found" });

  if (target.role === "owner") {
    return res.status(403).json({ error: "Cannot remove team owner" });
  }

  db.prepare(
    "UPDATE team_members SET status = 'suspended' WHERE team_id = ? AND user_id = ?"
  ).run(req.params.teamId, req.params.memberId);

  res.json({ success: true, message: "Member removed" });
});

// ── Change role ─────────────────────────────────────────────────────────────

router.put("/teams/:teamId/members/:memberId/role", (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  const member = getTeamMember(req.params.teamId, userId);

  if (!member || member.role !== "owner") {
    return res.status(403).json({ error: "Only team owner can change roles" });
  }

  const { role } = req.body;
  if (!["viewer", "member", "admin"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  db.prepare(
    "UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?"
  ).run(role, req.params.teamId, req.params.memberId);

  res.json({ success: true });
});

// ── Team file permissions ───────────────────────────────────────────────────

router.post("/teams/:teamId/permissions", (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  const member = getTeamMember(req.params.teamId, userId);

  if (!member || !hasPermission(member.role, "admin")) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const { filepath, visibility } = req.body;
  if (!filepath || !["team", "private"].includes(visibility)) {
    return res.status(400).json({ error: "filepath and visibility (team|private) required" });
  }

  db.prepare(
    `INSERT OR REPLACE INTO file_permissions (team_id, filepath, visibility, owner_user_id)
     VALUES (?, ?, ?, ?)`
  ).run(req.params.teamId, filepath, visibility, visibility === "private" ? userId : null);

  res.json({ success: true });
});

// ── Team activity feed ──────────────────────────────────────────────────────

router.get("/teams/:teamId/activity", (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  const member = getTeamMember(req.params.teamId, userId);
  if (!member) return res.status(403).json({ error: "Not a team member" });

  const team = db.prepare("SELECT s3_prefix FROM teams WHERE id = ?").get(req.params.teamId) as any;
  if (!team) return res.status(404).json({ error: "Team not found" });

  // Return team info including the S3 prefix for file operations
  res.json({
    team_id: req.params.teamId,
    s3_prefix: team.s3_prefix,
    user_role: member.role,
  });
});

// ── Delete team ─────────────────────────────────────────────────────────────

router.delete("/teams/:teamId", (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  const member = getTeamMember(req.params.teamId, userId);

  if (!member || member.role !== "owner") {
    return res.status(403).json({ error: "Only team owner can delete the team" });
  }

  // Soft delete: mark all members as suspended
  db.prepare("UPDATE team_members SET status = 'suspended' WHERE team_id = ?").run(
    req.params.teamId
  );
  db.prepare("UPDATE teams SET subscription_status = 'canceled' WHERE id = ?").run(
    req.params.teamId
  );

  res.json({ success: true, message: "Team deleted" });
});

export default router;
