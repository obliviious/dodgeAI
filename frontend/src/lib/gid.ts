/** Parse `SalesOrder:740506` or `JournalEntry:ABCD|2025|9400000249` for API routes. */
export function parseGid(gid: string): { type: string; id: string } {
  const i = gid.indexOf(":");
  if (i <= 0) {
    return { type: "Entity", id: encodeURIComponent(gid) };
  }
  const type = gid.slice(0, i);
  const idRaw = gid.slice(i + 1);
  return { type, id: encodeURIComponent(idRaw) };
}
