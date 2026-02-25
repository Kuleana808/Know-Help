/**
 * know.help Mindset Capture — Background Service Worker
 * Handles sync, badge updates, and periodic push to server.
 */

const API_BASE = "https://know.help/api/capture";
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── Badge management ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "UPDATE_BADGE") {
    const count = message.count || 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#1a4a2e" });
    sendResponse({ ok: true });
  }

  if (message.type === "GET_PENDING_COUNT") {
    chrome.storage.local.get("pending", ({ pending = [] }) => {
      sendResponse({ count: pending.length });
    });
    return true; // Async response
  }

  if (message.type === "SYNC_NOW") {
    syncSignals().then((result) => {
      sendResponse(result);
    });
    return true; // Async response
  }

  if (message.type === "GET_STATUS") {
    chrome.storage.local.get(["pending", "lastSync", "creatorId"], (data) => {
      sendResponse({
        pending: (data.pending || []).length,
        lastSync: data.lastSync || null,
        creatorId: data.creatorId || null,
      });
    });
    return true;
  }
});

// ── Sync to server ──────────────────────────────────────────────────────────

async function syncSignals() {
  const { pending = [], creatorId, authToken } = await chrome.storage.local.get([
    "pending",
    "creatorId",
    "authToken",
  ]);

  if (!creatorId || !authToken) {
    return { error: "Not authenticated. Open popup to log in." };
  }

  if (pending.length === 0) {
    return { synced: 0, message: "Nothing to sync." };
  }

  try {
    const response = await fetch(`${API_BASE}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "X-Creator-ID": creatorId,
      },
      body: JSON.stringify({ signals: pending }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { error: err.error || `Sync failed (${response.status})` };
    }

    const result = await response.json();

    // Clear synced signals
    await chrome.storage.local.set({
      pending: [],
      lastSync: new Date().toISOString(),
    });

    // Update badge
    chrome.action.setBadgeText({ text: "" });

    return { synced: result.synced || pending.length, message: "Sync complete." };
  } catch (err) {
    return { error: `Network error: ${err.message}` };
  }
}

// ── Periodic sync alarm ─────────────────────────────────────────────────────

chrome.alarms.create("syncAlarm", { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "syncAlarm") {
    syncSignals().catch(console.error);
  }
});

// ── Install / startup ───────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "" });
  chrome.action.setBadgeBackgroundColor({ color: "#1a4a2e" });
});

// Restore badge on startup
chrome.runtime.onStartup.addListener(async () => {
  const { pending = [] } = await chrome.storage.local.get("pending");
  if (pending.length > 0) {
    chrome.action.setBadgeText({ text: String(pending.length) });
  }
});
