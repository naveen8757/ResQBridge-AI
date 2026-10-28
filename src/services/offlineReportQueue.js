const QUEUE_KEY = "resqbridge_pending_reports";
let activeSync = null;

export function readQueuedReports() {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeQueuedReports(items) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

/**
 * Synchronize queued incident reports idempotently. A shared in-flight promise
 * prevents the page-level and app-level online listeners racing each other.
 */
export function syncQueuedReports(client) {
  if (activeSync) return activeSync;
  activeSync = runSync(client).finally(() => { activeSync = null; });
  return activeSync;
}

async function runSync(client) {
  const result = { synced: 0, remaining: readQueuedReports().length, skippedOtherAccount: 0, message: "" };
  if (!client || !navigator.onLine) {
    result.message = "Offline or database not configured.";
    return result;
  }

  let queued;
  try {
    queued = readQueuedReports();
  } catch {
    result.message = "Could not read the local report queue.";
    return result;
  }
  if (!queued.length) return result;

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    result.message = "Sign in with the account that created the queued reports to synchronize them.";
    return result;
  }

  for (const item of queued) {
    if (!navigator.onLine) break;
    const localId = item.local_id || item.client_id;
    if (item.user_id && item.user_id !== data.user.id) {
      result.skippedOtherAccount += 1;
      continue;
    }
    const { local_id, queued_at, ...report } = item;
    report.user_id = data.user.id;

    try {
      const { error: upsertError } = await client
        .from("disaster_reports")
        .upsert([report], { onConflict: "client_id", ignoreDuplicates: true });
      if (upsertError) {
        result.message = upsertError.message;
        continue;
      }

      const current = readQueuedReports();
      const next = current.filter((entry) => (entry.local_id || entry.client_id) !== localId);
      writeQueuedReports(next);
      result.synced += 1;
    } catch (syncError) {
      result.message = syncError?.message || "A queued report could not be synchronized.";
    }
  }

  result.remaining = readQueuedReports().length;
  if (result.synced > 0) result.message = `${result.synced} offline report(s) synchronized successfully.`;
  return result;
}
