import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-lg">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
      {children}
    </CardContent>
  </Card>
);

export default function Help() {
  return (
    <div className="space-y-5 pb-8 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">How to Play</h1>
        <p className="text-muted-foreground mt-1">Everything you need to know about NFL Pick'em</p>
      </div>

      <Section title="📋 The Basics">
        <p>
          At the start of the season, you pick a winner for every game across all <strong className="text-foreground">18 weeks</strong> of the NFL season — 288 games total. Picks are locked in before the season kicks off, so choose wisely!
        </p>
        <p>
          During the season, results are entered by the commissioner and your score updates automatically. Track your standing on the Leaderboard.
        </p>
      </Section>

      <Section title="🏆 Scoring">
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <span className="text-foreground font-medium">Correct pick</span>
            <Badge variant="secondary" className="text-green-400 bg-green-500/10">+1 point</Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-foreground font-medium">Wrong pick</span>
            <Badge variant="secondary" className="text-muted-foreground bg-secondary">0 points</Badge>
          </div>
        </div>
        <p>There are no negative points — every correct pick earns exactly 1 point.</p>
      </Section>

      <Section title="⏰ Deadlines">
        <p>
          All <strong className="text-foreground">288 picks must be submitted before the season starts</strong> in September. Once the commissioner switches the league to "in-season" mode, the Picks page is locked — no more changes.
        </p>
        <p>
          Once you've submitted all 288 picks, your picks are locked into a summary view. You can tap <strong className="text-foreground">Edit Picks</strong> to go back and make changes anytime before the season starts.
        </p>
        <p>
          Use the <strong className="text-foreground">Autofill</strong> tools on the Picks page to quickly fill in any games you haven't picked: home teams, point spread favorites, or random.
        </p>
      </Section>

      <Section title="📊 Your Record">
        <p>
          Your W-L record only counts games where the commissioner has entered a result. If a game hasn't been decided yet, it won't affect your record — so everyone starts <strong className="text-foreground">0-0</strong> at the beginning of the season.
        </p>
      </Section>

      <Section title="🏅 Badges">
        <div className="space-y-3">
          {[
            { emoji: "👑", name: "League Leader", desc: "You're currently #1 in points." },
            { emoji: "🏆", name: "Perfect Week", desc: "You correctly picked every game in the most recent completed week." },
            { emoji: "🔥", name: "Week High Score", desc: "One 🔥 for each week you had the highest score in the league." },
            { emoji: "💩", name: "Week Low Score", desc: "One 💩 for each week you had the lowest score in the league." },
          ].map(({ emoji, name, desc }) => (
            <div key={name} className="flex items-start gap-3">
              <span className="text-2xl shrink-0">{emoji}</span>
              <div>
                <p className="font-medium text-foreground">{name}</p>
                <p>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="💬 Smack Board">
        <p>
          Found on the Week tab — a group chat for trash talk, bragging rights, and general NFL chaos. Messages are visible to everyone in the league. Keep it fun!
        </p>
      </Section>

      <Section title="💡 Tips">
        <ul className="space-y-2 list-disc list-inside">
          <li>Save your picks often — the save button appears when you make changes.</li>
          <li>Use "Submit All Picks" (turns green when all 288 are filled) to confirm your full ballot — it locks into a summary view.</li>
          <li>Check the Standings page for season trends and who's running hot.</li>
          <li>The Week tab shows pick splits — see which way the league is leaning on each game.</li>
          <li>Tap your rank (#) in the header to jump straight to Standings.</li>
        </ul>
      </Section>
    </div>
  );
}
