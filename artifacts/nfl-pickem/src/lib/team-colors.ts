export const NFL_TEAM_COLORS: Record<string, string> = {
  ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D",
  CAR: "#0085CA", CHI: "#0B162A", CIN: "#FB4F14", CLE: "#FF3C00",
  DAL: "#003594", DEN: "#FB4F14", DET: "#0076B6", GB: "#203731",
  HOU: "#03202F", IND: "#002C5F", JAX: "#006778", KC: "#E31837",
  LAC: "#0080C6", LAR: "#003594", LV: "#A5ACAF", MIA: "#008E97",
  MIN: "#4F2683", NE: "#002244", NO: "#9F8958", NYG: "#0B2265",
  NYJ: "#125740", PHI: "#004C54", PIT: "#FFB612", SEA: "#002244",
  SF: "#AA0000", TB: "#D50A0A", TEN: "#4B92DB", WAS: "#5A1414",
};

const NFL_TEAM_ALTERNATE_COLORS: Record<string, string> = {
  ARI: "#000000", ATL: "#000000", BAL: "#D0A85C", BUF: "#C60C30",
  CAR: "#101820", CHI: "#C83803", CIN: "#000000", CLE: "#311D00",
  DAL: "#869397", DEN: "#002244", DET: "#B0B7BC", GB: "#FFB612",
  HOU: "#A71930", IND: "#A2AAAD", JAX: "#D7A22A", KC: "#FFB81C",
  LAC: "#FFC20E", LAR: "#FFA300", LV: "#000000", MIA: "#FC4C02",
  MIN: "#FFC62F", NE: "#C60C30", NO: "#000000", NYG: "#A71930",
  NYJ: "#000000", PHI: "#A5ACAF", PIT: "#000000", SEA: "#69BE28",
  SF: "#B3995D", TB: "#34302B", TEN: "#C8102E", WAS: "#FFB612",
};

export function getTeamColor(abbrev: string, fallback = "#888888"): string {
  return NFL_TEAM_COLORS[abbrev?.toUpperCase()] ?? fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function colorsAreSimilar(first: string, second: string): boolean {
  const [r1, g1, b1] = hexToRgb(first);
  const [r2, g2, b2] = hexToRgb(second);
  const distance = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  return distance < 85;
}

function getTeamAlternateColor(abbrev: string): string {
  return NFL_TEAM_ALTERNATE_COLORS[abbrev?.toUpperCase()] ?? getTeamColor(abbrev);
}

export function getTeamSplitColors(awayTeam: string, homeTeam: string): { away: string; home: string } {
  const away = getTeamColor(awayTeam);
  const home = getTeamColor(homeTeam);
  if (!colorsAreSimilar(away, home)) return { away, home };

  const homeAlternate = getTeamAlternateColor(homeTeam);
  if (!colorsAreSimilar(away, homeAlternate)) return { away, home: homeAlternate };

  const awayAlternate = getTeamAlternateColor(awayTeam);
  if (!colorsAreSimilar(awayAlternate, home)) return { away: awayAlternate, home };

  return { away: awayAlternate, home: homeAlternate };
}
