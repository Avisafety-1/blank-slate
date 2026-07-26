import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export const AiAuditCard = () => (
  <Card className="border-primary/30 bg-primary/5">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-base">
        <Sparkles className="w-4 h-4 text-primary" />
        AI Audit Assistant
      </CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p className="text-sm text-muted-foreground max-w-xl">
        I fremtidige versjoner vil AviSafe automatisk analysere virksomhetens compliance, finne
        svakheter og foreslå forbedringer.
      </p>
      <Button variant="outline" disabled className="w-full sm:w-auto">Kommer snart</Button>
    </CardContent>
  </Card>
);
