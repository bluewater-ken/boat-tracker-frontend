// Shared hull-color options, used by Boat Information and Key Parts so both tabs
// offer the same growing dropdown. Options = a seed list plus every color already
// on a boat; new colors persist simply by being saved on a boat (its hull_color).
// White is pinned first, the rest alphabetical (BRD §7c ordering).
export const SEED_COLORS = ['White', 'Ice Blue', 'Black', 'Medium Gray', 'Matterhorn White'];

export function colorOptions(boats = []) {
  const set = new Set(SEED_COLORS);
  for (const b of boats) if (b?.hull_color) set.add(b.hull_color);
  return Array.from(set).sort((a, b) =>
    a === 'White' ? -1 : b === 'White' ? 1 : a.localeCompare(b)
  );
}
