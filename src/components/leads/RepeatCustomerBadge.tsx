import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Repeat2 } from "lucide-react";

interface SubmissionEntry {
  id: string;
  source: string;
  created_at: string;
  follow_up_status: string;
  customer_name: string;
}

interface RepeatCustomerBadgeProps {
  currentLeadId: string;
  submissions: SubmissionEntry[];
  onSelectLead: (submission: SubmissionEntry) => void;
}

const sourceLabel: Record<string, string> = {
  widget: 'Ring OS',
  diamond_form: 'Diamond Form',
  grill_form: 'Grillz',
  custom_enquiry: 'Custom Enquiry',
  ring_builder: 'Ring Builder',
  booking: 'Booking',
};


export const RepeatCustomerBadge = ({ currentLeadId, submissions, onSelectLead }: RepeatCustomerBadgeProps) => {
  if (submissions.length < 2) return null;

  return (
    <Popover>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted hover:bg-muted/80 text-[10px] font-medium text-muted-foreground transition-colors shrink-0" title={`${submissions.length} submissions from this email`}>
          <Repeat2 className="h-3 w-3" />
          ×{submissions.length}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium text-muted-foreground px-2 py-1.5">
          {submissions.length} submissions from this customer
        </p>
        <div className="space-y-0.5">
          {submissions
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((sub) => {
              const isCurrent = sub.id === currentLeadId;
              return (
                <button
                  key={sub.id}
                  disabled={isCurrent}
                  onClick={() => onSelectLead(sub)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                    isCurrent
                      ? 'bg-primary/10 text-primary font-medium cursor-default'
                      : 'hover:bg-muted cursor-pointer'
                  }`}
                >
                  <span className="flex-1 truncate">{sourceLabel[sub.source] || sub.source}</span>
                  <span className="text-muted-foreground shrink-0">
                    {format(new Date(sub.created_at), 'MMM d, yyyy')}
                  </span>
                </button>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
