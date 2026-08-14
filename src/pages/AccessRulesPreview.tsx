import { AccessRulesDialog } from "@/components/admin/AccessRulesDialog";

export default function AccessRulesPreview() {
  return (
    <div className="min-h-screen bg-background p-8">
      <AccessRulesDialog open={true} onOpenChange={() => {}} />
    </div>
  );
}
