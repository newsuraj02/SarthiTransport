// MESSAGE TICKS STATE (owner 2026-11-14; trimmed 2026-11-25 when MSG91 and its delivery webhook were removed). The only thing still used is the shape of a FAILED record:
// functions/smsFunctions.js writes `whatsappStatus/{mobile}.byKind.<kind>` = { status: "sent", ... } when the SMS gateway accepted the message, or this failed state with the
// gateway's reason, which Admin's driver rows show as the red "!" (src/waTicks.jsx). The collection keeps its old name.
const mobile10 = (v) => String(v == null ? "" : v).replace(/\D/g, "").slice(-10);

function failedSendState(batchId, reason, at) { return { status: "failed", batchId, submittedAt: at, failedAt: at, reason: String(reason || "").slice(0, 200) }; }

module.exports = { mobile10, failedSendState };
