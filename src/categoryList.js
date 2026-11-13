// VEHICLE LIST ROWS (screen 1 of the customer booking) -- which categories are offered.
// Pure (no React) so the invariants can run it.
//
// BUG 2026-11-13 (owner: "Nasir Ahmed tried booking a 500 kg vehicle, the category was not showing despite 24-25 500 kg vehicles in the area; it worked only after
// uninstall + reinstall; previously it only showed categories above 4000 kg"): before Pickup is chosen the list is measured from the phone's own GPS. A phone with no
// usable location (permission off / blocked, GPS not answering) can place NO individual driver, so only a transporter's vehicles -- which have no phone location and skip the
// radius -- were listed, i.e. only their (big) categories, and the "full set of categories" fallback applied only when the list was completely empty. The customer could not
// pick 500 kg at all. Reinstalling re-asked for the location permission, which is why that "fixed" it.
//
// NOW: in the preview (places not chosen yet), when the phone has NO usable location, EVERY category is offered (the phone cannot tell which are nearby, so none may be hidden);
// a category with vehicles known nearby shows its "N min away", the others show none. A phone WITH a location keeps the old rule (only categories with vehicles nearby; the full
// set only when nothing at all is nearby). Whether a vehicle really is near the real Pickup is checked once Pickup is chosen (after that only categories with vehicles are listed).

// groups: [{ index, entries: [...] }] from the nearby vehicles. -> the groups to show, sorted by category.
export function mergeListGroups(groups, { placesReady = false, hasLocation = true, selectedCategory = null, categoryCount = 0 } = {}) {
  const g = (groups || []).slice();
  if (!placesReady && (!hasLocation || g.length === 0)) {
    for (let index = 0; index < categoryCount; index++) if (!g.some((x) => x.index === index)) g.push({ index, entries: [] });
  }
  if (selectedCategory != null && !g.some((x) => x.index === selectedCategory)) g.push({ index: selectedCategory, entries: [] });
  return g.sort((a, b) => a.index - b.index);
}
