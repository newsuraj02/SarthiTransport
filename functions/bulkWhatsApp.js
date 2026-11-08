// MSG91's answer to a bulk WhatsApp call, read honestly (owner 2026-11-08: every bulk WhatsApp button showed only "Couldn't send" and nobody could tell why).
// MSG91 can answer HTTP 200 with the error only inside the body, so the body counts too. `detail` is the short reason Admin sees next to the red message.
function judgeMsg91Response(status, bodyText) {
  const text = String(bodyText == null ? "" : bodyText).trim();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  const word = String(json && (json.status != null ? json.status : json.type != null ? json.type : "")).toLowerCase();
  const failedInBody = ["fail", "failed", "error"].includes(word) || (json && (json.hasError === true || json.success === false));
  const ok = status >= 200 && status < 300 && !failedInBody;
  if (ok) return { ok: true, detail: "" };
  let why = "";
  if (json) {
    const m = json.message || json.msg || json.error || json.errors || json.data;
    why = typeof m === "string" ? m : m != null ? JSON.stringify(m) : "";
  }
  if (!why) why = text;
  return { ok: false, detail: `HTTP ${status}${why ? `: ${why}` : ""}`.replace(/\s+/g, " ").slice(0, 220) };
}
module.exports = { judgeMsg91Response };
