// ESPN CDN team logo URLs for all 32 NFL teams
// Usage: getTeamLogo("BAL") → "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png"

const ESPN_ABBREV: Record<string, string> = {
  ARI: "ari", ATL: "atl", BAL: "bal", BUF: "buf",
  CAR: "car", CHI: "chi", CIN: "cin", CLE: "cle",
  DAL: "dal", DEN: "den", DET: "det", GB: "gb",
  HOU: "hou", IND: "ind", JAX: "jax", KC: "kc",
  LAC: "lac", LAR: "lar", LV: "lv", MIA: "mia",
  MIN: "min", NE: "ne", NO: "no", NYG: "nyg",
  NYJ: "nyj", PHI: "phi", PIT: "pit", SEA: "sea",
  SF: "sf", TB: "tb", TEN: "ten", WAS: "wsh",
};

export function getTeamLogo(abbrev: string): string {
  const espn = ESPN_ABBREV[abbrev.toUpperCase()] ?? abbrev.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${espn}.png`;
}

export function TeamLogo({ team, size = 32, className = "" }: { team: string; size?: number; className?: string }) {
  return (
    <img
      src={getTeamLogo(team)}
      alt={team}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
    />
  );
}
