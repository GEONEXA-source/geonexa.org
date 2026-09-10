// GeoNEXA AI — Engineer Community Chat
// Requires config.js to be loaded first (it defines `supabaseClient`)

let session = null;
let profile = null;
let senderName = "Engineer";
let realtimeChannel = null;
let isAdmin = false;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if (window.showLoader) showLoader("Loading chat…");

  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session) {
    if (window.hideLoader) hideLoader();
    location.href = "login.html";
    return;
  }
  session = data.session;

  const p = await supabaseClient
    .from("profiles")
    .select("full_name, role, user_type, is_subscribed, subscription_expires_at")
    .eq("id", session.user.id)
    .single();

  if (p.error) {
    if (window.hideLoader) hideLoader();
    showLocked("Profile could not be loaded. Check the profiles table and RLS policy.");
    return;
  }

  profile = p.data;
  const role = (profile.role || profile.user_type || "").toLowerCase();
  isAdmin = role === "admin";
  const subscribed = !!(profile.is_subscribed && (!profile.subscription_expires_at || new Date(profile.subscription_expires_at) > new Date()));

  if (!isAdmin && !["engineer", "surveyor"].includes(role)) {
    if (window.hideLoader) hideLoader();
    location.href = "dashboard.html";
    return;
  }

  // Admins bypass the subscription requirement entirely — they're here to
  // oversee/moderate, not as a paying engineer seat.
  if (!isAdmin && !subscribed) {
    if (window.hideLoader) hideLoader();
    showLocked("Chat is available to subscribed engineers and surveyors. Subscribe from the Engineer Panel to join the conversation.");
    return;
  }

  senderName = isAdmin ? `${profile.full_name || session.user.email} (Admin)` : (profile.full_name || session.user.email || "Engineer");

  if (isAdmin) {
    const title = document.querySelector(".title-block p");
    if (title) title.textContent = "Moderator view — you can see, remove, or announce messages";
    const form = document.getElementById("chatForm");
    const announceRow = document.createElement("label");
    announceRow.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--teal);flex-shrink:0;white-space:nowrap;";
    announceRow.innerHTML = `<input type="checkbox" id="announceToggle" style="accent-color:var(--teal);"> 📣 Announce`;
    form.insertBefore(announceRow, form.firstChild);
  }

  await loadMessages();
  wireForm();
  subscribeRealtime();

  if (window.hideLoader) hideLoader();
}

function showLocked(message) {
  const area = document.getElementById("chatArea");
  area.innerHTML = `<div class="locked">🔒 ${escapeHTML(message)}</div>`;
}

async function loadMessages() {
  const area = document.getElementById("chatArea");
  try {
    // recipient_id IS NULL selects only shared-room messages — DMs (once
    // added later) will use a non-null recipient_id and won't show here.
    const { data, error } = await supabaseClient
      .from("engineer_messages")
      .select("*")
      .is("recipient_id", null)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw error;

    if (!data || data.length === 0) {
      area.innerHTML = `<div class="empty-state">No messages yet. Be the first to say hello to the team.</div>`;
    } else {
      area.innerHTML = "";
      data.forEach(renderMessage);
      scrollToBottom();
    }

    document.getElementById("chatForm").style.display = "flex";
  } catch (err) {
    console.error("Chat load failed:", err);
    area.innerHTML = `<div class="empty-state">Couldn't load chat. Make sure the migration for cadastral.engineer_messages has been run and the cadastral schema is exposed in Supabase → Settings → API.</div>`;
  }
}

function renderMessage(m) {
  const area = document.getElementById("chatArea");
  const isMe = m.sender_id === session.user.id;
  const isAnnouncement = !!m.is_announcement;

  const row = document.createElement("div");
  row.className = "msg-row " + (isMe ? "me" : "them") + (isAnnouncement ? " announcement" : "");
  row.dataset.id = m.id;

  const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const deleteBtn = isAdmin
    ? `<button class="mod-delete-btn" data-id="${m.id}" title="Remove message" style="background:none;border:none;color:var(--red);font-size:10.5px;cursor:pointer;padding:0;margin-left:8px;">Remove</button>`
    : "";
  const badge = isAnnouncement ? `<span class="announce-badge">📣 Announcement</span>` : "";

  row.innerHTML = `
    ${!isMe ? `<div class="msg-sender">${escapeHTML(m.sender_name || "Engineer")}</div>` : ""}
    ${badge}
    <div class="msg-bubble">${escapeHTML(m.message)}</div>
    <div class="msg-time">${time}${deleteBtn}</div>
  `;
  area.appendChild(row);

  if (isAdmin) {
    const btn = row.querySelector(".mod-delete-btn");
    if (btn) btn.addEventListener("click", () => moderateDelete(m.id, row));
  }
}

async function moderateDelete(id, rowEl) {
  if (!confirm("Remove this message for everyone?")) return;
  try {
    const { error } = await supabaseClient.from("engineer_messages").delete().eq("id", id);
    if (error) throw error;
    rowEl.remove();
  } catch (err) {
    console.error("Moderation delete failed:", err);
    alert("Couldn't remove message: " + (err.message || err));
  }
}

function wireForm() {
  document.getElementById("chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;

    const announceToggle = document.getElementById("announceToggle");
    const isAnnouncement = isAdmin && announceToggle && announceToggle.checked;

    const btn = document.getElementById("sendBtn");
    btn.disabled = true;
    input.value = "";

    try {
      const { error } = await supabaseClient.from("engineer_messages").insert({
        sender_id: session.user.id,
        sender_name: senderName,
        recipient_id: null, // shared room for now — DMs will set this later
        message: text,
        is_announcement: isAnnouncement,
      });
      if (error) throw error;
      // No manual re-render here — the realtime subscription below will
      // append this message (and everyone else's) as soon as it lands.
    } catch (err) {
      console.error("Send failed:", err);
      input.value = text; // give the message back so nothing is lost
      alert("Couldn't send: " + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  });
}

function subscribeRealtime() {
  realtimeChannel = supabaseClient
    .channel("engineer-room-chat")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "cadastral", table: "engineer_messages" },
      (payload) => {
        const m = payload.new;
        if (m.recipient_id !== null) return; // ignore future DMs on this page
        const area = document.getElementById("chatArea");
        if (area.querySelector(".empty-state")) area.innerHTML = "";
        renderMessage(m);
        scrollToBottom();
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "cadastral", table: "engineer_messages" },
      (payload) => {
        const row = document.querySelector(`.msg-row[data-id="${payload.old.id}"]`);
        if (row) row.remove();
      }
    )
    .subscribe();
}

function scrollToBottom() {
  const area = document.getElementById("chatArea");
  area.scrollTop = area.scrollHeight;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = String(str ?? "");
  return div.innerHTML;
}

window.addEventListener("beforeunload", () => {
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
});
      
