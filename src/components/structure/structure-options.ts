export interface StructureOption {
  id: number;
  label: string;
  /** Optional section header. Used to group departments under their faculty. */
  group?: string;
}

/**
 * Matches a search term against both the option's own label and its group name, so an
 * aspirant who types "engineering" finds every engineering department even though
 * "engineering" appears in none of those department names.
 *
 * Query is trimmed and lowercased; an empty query returns everything untouched.
 */
export function filterOptions(
  options: StructureOption[],
  query: string,
): StructureOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(needle) ||
      (option.group ? option.group.toLowerCase().includes(needle) : false),
  );
}

/**
 * Collapses options into consecutive runs that share a group, so the list renders one sticky
 * header per faculty instead of repeating it. Consecutive-only is deliberate: it preserves
 * whatever order the caller supplied and never silently reorders rows. Callers that want a
 * faculty's departments kept together sort before passing options in.
 */
export function groupOptions(
  options: StructureOption[],
): { group: string | null; options: StructureOption[] }[] {
  const groups: { group: string | null; options: StructureOption[] }[] = [];

  for (const option of options) {
    const key = option.group ?? null;
    const last = groups.at(-1);
    if (last && last.group === key) last.options.push(option);
    else groups.push({ group: key, options: [option] });
  }

  return groups;
}
