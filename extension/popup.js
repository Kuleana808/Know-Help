/**
 * know.help Mindset Capture — Popup Script
 */

const authView = document.getElementById("auth-view");
const statusView = document.getElementById("status-view");
const logoutBtn = document.getElementById("logout-btn");

// Elements
const creatorIdInput = document.getElementById("creator-id-input");
const authTokenInput = document.getElementById("auth-token-input");
const saveAuthBtn = document.getElementById("save-auth-btn");
const authMessage = document.getElementById("auth-message");
const pendingCount = document.getElementById("pending-count");
const lastSync = document.getElementById("last-sync");
const creatorDisplay = document.getElementById("creator-display");
const syncBtn = document.getElementById("sync-btn");
const viewSignalsBtn = document.getElementById("view-signals-btn");
const syncMessage = document.getElementById("sync-message");

// ── Initialize ──────────────────────────────────────────────────────────────

async function init() {
  const { creatorId, authToken } = await chrome.storage.local.get([
    "creatorId",
    "authToken",
  ]);

  if (creatorId && authToken) {
    showStatusView(creatorId);
  } else {
    showAuthView();
  }
}

function showAuthView() {
  authView.style.display = "block";
  statusView.style.display = "none";
  logoutBtn.style.display = "none";
}

async function showStatusView(creatorId) {
  authView.style.display = "none";
  statusView.style.display = "block";
  logoutBtn.style.display = "inline";
  creatorDisplay.textContent = creatorId;

  // Get status from background
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (status) => {
    if (status) {
      pendingCount.textContent = status.pending || 0;
      lastSync.textContent = status.lastSync
        ? formatTime(status.lastSync)
        : "Never";
    }
  });
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return d.toLocaleDateString();
}

function showMessage(el, text, type) {
  el.textContent = text;
  el.className = `message ${type}`;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, 5000);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

saveAuthBtn.addEventListener("click", async () => {
  const creatorId = creatorIdInput.value.trim();
  const authToken = authTokenInput.value.trim();

  if (!creatorId || !authToken) {
    showMessage(authMessage, "Both fields are required.", "error");
    return;
  }

  await chrome.storage.local.set({ creatorId, authToken });
  showMessage(authMessage, "Connected!", "success");
  setTimeout(() => showStatusView(creatorId), 500);
});

// ── Sync ─────────────────────────────────────────────────────────────────────

syncBtn.addEventListener("click", () => {
  syncBtn.disabled = true;
  syncBtn.textContent = "Syncing...";

  chrome.runtime.sendMessage({ type: "SYNC_NOW" }, (result) => {
    syncBtn.disabled = false;
    syncBtn.textContent = "Sync Now";

    if (result?.error) {
      showMessage(syncMessage, result.error, "error");
    } else {
      showMessage(syncMessage, `Synced ${result?.synced || 0} signals.`, "success");
      pendingCount.textContent = "0";
      lastSync.textContent = "Just now";
    }
  });
});

// ── View signals ─────────────────────────────────────────────────────────────

viewSignalsBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://know.help/creator/capture" });
});

// ── Logout ───────────────────────────────────────────────────────────────────

logoutBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(["creatorId", "authToken", "pending", "lastSync"]);
  chrome.action.setBadgeText({ text: "" });
  showAuthView();
});

// ── Init ─────────────────────────────────────────────────────────────────────

init();
