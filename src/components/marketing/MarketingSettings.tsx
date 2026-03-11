import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const platforms = [
  { name: "LinkedIn", status: "Planlagt", desc: "Automatisk publisering kommer snart." },
  { name: "Facebook", status: "Planlagt", desc: "Automatisk publisering kommer snart." },
  { name: "Instagram", status: "Planlagt", desc: "Automatisk publisering kommer snart." },
  { name: "Blogg", status: "Planlagt", desc: "CMS-integrasjon kommer snart." },
  { name: "E-post", status: "Planlagt", desc: "Nyhetsbrev-integrasjon kommer snart." },
];

export const MarketingSettings = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Innstillinger</h1>
      <p className="text-muted-foreground text-sm mt-1">
        Konfigurer plattformintegrasjoner og publiseringsinnstillinger.
      </p>
    </div>

    <div className="space-y-3">
      {platforms.map((p) => (
        <Card key={p.name} className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {p.name}
              <Badge variant="outline" className="text-xs">{p.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{p.desc}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);
