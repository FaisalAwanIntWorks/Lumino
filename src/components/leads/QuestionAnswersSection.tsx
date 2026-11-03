import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

interface QuestionAnswersSectionProps {
  answers: Record<string, any>;
  title?: string;
  compact?: boolean;
}

const formatLabel = (key: string) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export const QuestionAnswersSection = ({ answers, title = "Questions & Answers", compact = false }: QuestionAnswersSectionProps) => {
  const entries = Object.entries(answers).filter(([_, val]) => {
    if (val === null || val === undefined) return false;
    // Handle primitive values (legacy formats)
    if (typeof val !== 'object') return val !== '';
    // Handle structured { answer, text, type }
    const a = val.answer;
    return a !== null && a !== undefined && a !== '';
  });

  if (entries.length === 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([key, val]) => {
          const label = formatLabel(key);
          const displayVal = getCompactDisplay(val);
          if (!displayVal) return null;
          return (
            <Badge key={key} variant="outline" className="text-[10px] capitalize">
              {label}: {displayVal}
            </Badge>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <p className="text-xs text-muted-foreground mb-2">{title}</p>
      <div className="space-y-2">
        {entries.map(([key, val]) => (
          <QuestionAnswerRow key={key} questionKey={key} value={val} />
        ))}
      </div>
    </div>
  );
};

function getCompactDisplay(val: any): string | null {
  if (typeof val !== 'object') return String(val);
  const { answer, text, type } = val;
  if (type === 'yes_no') {
    if (answer === true) return text ? `Yes — ${text}` : 'Yes';
    if (answer === false) return 'No';
    return null;
  }
  if (typeof answer === 'string' && answer) return text ? `${answer} — ${text}` : answer;
  if (answer === true) return text || 'Yes';
  if (answer === false) return 'No';
  return null;
}

function QuestionAnswerRow({ questionKey, value }: { questionKey: string; value: any }) {
  const label = formatLabel(questionKey);

  // Handle primitive values
  if (typeof value !== 'object') {
    return (
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{String(value)}</p>
      </div>
    );
  }

  const { answer, text, type } = value;

  // yes_no type
  if (type === 'yes_no') {
    return (
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <Badge variant={answer === true ? 'secondary' : 'outline'} className="text-xs">
            {answer === true ? 'Yes' : 'No'}
          </Badge>
          {text && <span className="text-sm">{text}</span>}
        </div>
      </div>
    );
  }

  // file type — answer may be a URL string or array of URLs
  if (type === 'file') {
    const urls = Array.isArray(answer) ? answer : (typeof answer === 'string' && answer ? [answer] : []);
    if (urls.length === 0) return null;
    return (
      <div>
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <div className="flex flex-wrap gap-2">
          {urls.map((url: string, i: number) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative w-16 h-16 rounded-lg border border-border/60 overflow-hidden hover:border-primary/50 transition-colors"
            >
              <img src={url} alt={`${label} ${i + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ExternalLink className="h-3.5 w-3.5 text-white" />
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  }

  // text, dropdown, custom_options, or any other string answer
  if (typeof answer === 'string' && answer) {
    return (
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{answer}</p>
        {text && <p className="text-xs text-muted-foreground mt-0.5">{text}</p>}
      </div>
    );
  }

  // Boolean true/false (generic, no explicit type)
  if (typeof answer === 'boolean') {
    return (
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <Badge variant={answer ? 'secondary' : 'outline'} className="text-xs">
            {answer ? 'Yes' : 'No'}
          </Badge>
          {text && <span className="text-sm">{text}</span>}
        </div>
      </div>
    );
  }

  return null;
}
