export async function copyLinkText(value, {clipboard, fallback}) {
  try {
    if (!clipboard?.writeText) throw new Error("Clipboard unavailable");
    await clipboard.writeText(value);
    return true;
  } catch {
    try { return !!(await fallback(value)); }
    catch { return false; }
  }
}
