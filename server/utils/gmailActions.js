// Gmail actions used by Phase 3 (trash / untrash).
// These helpers take an already-authenticated Gmail client so a single
// scan/batch reuses one token instead of refreshing per message.

export async function getMessageState(gmail, id) {
  const msg = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "metadata",
    metadataHeaders: ["From", "Subject", "Date"],
  });

  const headers = msg.data.payload?.headers || [];
  const getH = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  const labelIds = msg.data.labelIds || [];

  return {
    id,
    from: getH("From"),
    subject: getH("Subject"),
    date: getH("Date"),
    internalDate: Number(msg.data.internalDate) || null,
    labelIds,
    isStarred: labelIds.includes("STARRED"),
    isImportant: labelIds.includes("IMPORTANT"),
    isTrash: labelIds.includes("TRASH"),
    isSpam: labelIds.includes("SPAM"),
  };
}

export async function trashMessages(gmail, messageIds = []) {
  const results = [];
  for (const id of messageIds) {
    try {
      await gmail.users.messages.trash({ userId: "me", id });
      results.push({ id, ok: true });
    } catch (e) {
      results.push({
        id,
        ok: false,
        reason: e.response?.data?.error?.message || e.message,
      });
    }
  }
  return results;
}

export async function untrashMessages(gmail, messageIds = []) {
  const results = [];
  for (const id of messageIds) {
    try {
      await gmail.users.messages.untrash({ userId: "me", id });
      results.push({ id, ok: true });
    } catch (e) {
      results.push({
        id,
        ok: false,
        reason: e.response?.data?.error?.message || e.message,
      });
    }
  }
  return results;
}
