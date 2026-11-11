import { CheckCircle2, FilePen, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SalaryStatus } from "@/lib/types";

const STYLE: Record<SalaryStatus, { label: string; variant: "neutral" | "info" | "success"; Icon: typeof Lock }> = {
  draft: { label: "Draft", variant: "neutral", Icon: FilePen },
  finalized: { label: "Finalized", variant: "info", Icon: Lock },
  received: { label: "Received", variant: "success", Icon: CheckCircle2 },
};

export function SalaryStatusBadge({ status, className }: { status: SalaryStatus; className?: string }) {
  const { label, variant, Icon } = STYLE[status];
  return (
    <Badge variant={variant} className={className}>
      <Icon /> {label.toUpperCase()}
    </Badge>
  );
}
