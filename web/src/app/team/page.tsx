"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";

interface Team {
  id: string;
  name: string;
  slug: string;
  subscription_status: string;
  member_count: number;
}

interface TeamMember {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
  status: string;
}

export default function TeamPage() {
  const { data: teams, refetch } = useApi<{ teams: Team[] }>("/api/teams/mine");
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const { data: members, refetch: refetchMembers } = useApi<{
    members: TeamMember[];
  }>(selectedTeam ? `/api/teams/${selectedTeam}/members` : null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  // Create team
  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  async function createTeam() {
    setCreating(true);
    try {
      await apiFetch("/api/teams/create", {
        method: "POST",
        body: { name: newTeamName },
      });
      setNewTeamName("");
      setShowCreate(false);
      refetch();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function inviteMember() {
    if (!selectedTeam || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await apiFetch(`/api/teams/${selectedTeam}/invite`, {
        method: "POST",
        body: { email: inviteEmail, role: inviteRole },
      });
      setInviteEmail("");
      refetchMembers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(userId: string) {
    if (!selectedTeam) return;
    if (!confirm("Remove this member from the team?")) return;
    try {
      await apiFetch(`/api/teams/${selectedTeam}/members/${userId}`, {
        method: "DELETE",
      });
      refetchMembers();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const team = teams?.teams?.find((t) => t.id === selectedTeam);

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-serif text-3xl">Teams</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn-primary"
        >
          Create team
        </button>
      </div>

      {/* Create team form */}
      {showCreate && (
        <div className="card mb-6">
          <h2 className="font-serif text-lg mb-3">New team</h2>
          <div className="flex gap-3">
            <input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              className="input flex-1"
              placeholder="Team name"
            />
            <button
              onClick={createTeam}
              disabled={creating || !newTeamName.trim()}
              className="btn-primary"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* Team list */}
        <div className="w-56 shrink-0 space-y-1">
          {!teams?.teams?.length ? (
            <p className="text-sm text-muted">No teams yet</p>
          ) : (
            teams.teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTeam(t.id)}
                className={`block w-full text-left px-3 py-2 rounded transition-colors ${
                  selectedTeam === t.id
                    ? "bg-accent-light text-accent"
                    : "hover:bg-bg2"
                }`}
              >
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted capitalize">
                  {t.subscription_status}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Team detail */}
        <div className="flex-1">
          {team ? (
            <div>
              <h2 className="font-serif text-xl mb-4">{team.name}</h2>

              {/* Invite form */}
              <div className="card mb-6">
                <h3 className="text-sm font-medium mb-3">Invite a member</h3>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="input flex-1"
                    placeholder="email@example.com"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="input w-32"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={inviteMember}
                    disabled={inviting || !inviteEmail.trim()}
                    className="btn-primary"
                  >
                    {inviting ? "..." : "Invite"}
                  </button>
                </div>
              </div>

              {/* Members list */}
              <div className="card">
                <h3 className="text-sm font-medium mb-3">Members</h3>
                {!members?.members?.length ? (
                  <p className="text-sm text-muted">No members yet</p>
                ) : (
                  <div className="divide-y divide-border">
                    {members.members.map((m) => (
                      <div
                        key={m.user_id}
                        className="flex items-center justify-between py-3"
                      >
                        <div>
                          <p className="text-sm">{m.email}</p>
                          <p className="text-xs text-muted capitalize">
                            {m.role} &middot; Joined{" "}
                            {new Date(m.joined_at).toLocaleDateString()}
                          </p>
                        </div>
                        {m.role !== "owner" && (
                          <button
                            onClick={() => removeMember(m.user_id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card text-center py-12">
              <p className="text-sm text-muted">
                Select a team or create a new one
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
