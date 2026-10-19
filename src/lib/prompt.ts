// The prompt that tells the agent to address the annotations of a snapshot.
// It uses only paths relative to the galley directory, because the agent can
// see the directory under another absolute path (in a container or on a
// remote host).

// Returns the name of the snapshot after the last one, for example "03".
export function nextSnapshotName(names: string[]): string {
  const max = Math.max(0, ...names.map((n) => parseInt(n, 10) || 0));
  const width = Math.max(2, ...names.map((n) => n.length));
  return String(max + 1).padStart(width, "0");
}

export function buildPrompt(doc: string, snapshot: string, allSnapshots: string[]): string {
  const next = nextSnapshotName(allSnapshots);
  return (
    `Read the annotations in \`${doc}/${snapshot}/annotations.md\` in the galley directory. ` +
    `Address them in the new snapshot \`${doc}/${next}/\`, as described in \`GALLEY.md\`.`
  );
}

// Writes `text` to the clipboard. Falls back to a hidden text area where the
// Clipboard API is not available.
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}
