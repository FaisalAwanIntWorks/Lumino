import { useRef, useEffect } from 'react';
import { ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';

export interface FlowQuestion {
  key: string;
  label: string;
  questionType: string;
  optionCount?: number;
  type: 'default_step' | 'custom';
}

export interface FlowQuestionGroup {
  questions: FlowQuestion[];
}

interface FlowPreviewProps {
  /** Legacy: flat list (each question = 1 step). Used by Grill & Custom Enquiry. */
  questions?: FlowQuestion[];
  /** New: grouped steps. Used by Ring Builder. */
  groups?: FlowQuestionGroup[];
  activeKey: string | null;
  onQuestionClick: (key: string) => void;
}

export function FlowPreview({ questions, groups, activeKey, onQuestionClick }: FlowPreviewProps) {
  // Derive groups from flat questions list if groups not provided
  const resolvedGroups: FlowQuestionGroup[] = groups
    || (questions || []).map(q => ({ questions: [q] }));
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeKey]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'yes_no': return 'Yes / No';
      case 'text': return 'Text';
      case 'dropdown': return 'Dropdown';
      case 'custom_options': return 'Options';
      case 'file': return 'File Upload';
      case 'options': return 'Selection';
      default: return type;
    }
  };

  const totalQuestions = resolvedGroups.reduce((sum, g) => sum + g.questions.length, 0);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border/50">
        <h3 className="text-sm font-semibold text-foreground">Form Flow Preview</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{totalQuestions} questions · {resolvedGroups.length} steps</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {resolvedGroups.map((group, gIndex) => {
          const isGroupActive = group.questions.some(q => activeKey === q.key);
          const isSingle = group.questions.length === 1;

          return (
            <div key={group.questions.map(q => q.key).join('-')} ref={isGroupActive ? activeRef : undefined}>
              {isSingle ? (
                <SingleQuestionCard
                  question={group.questions[0]}
                  index={gIndex}
                  isActive={activeKey === group.questions[0].key}
                  onClick={() => onQuestionClick(group.questions[0].key)}
                  getTypeLabel={getTypeLabel}
                />
              ) : (
                <motion.div
                  layout
                  className={`rounded-lg border-2 transition-all ${
                    isGroupActive
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/40 bg-card/50 hover:border-primary/30'
                  }`}
                >
                  <div className="p-2 space-y-1">
                    <div className="flex items-center gap-2 px-1">
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                        isGroupActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {gIndex + 1}
                      </span>
                      <span className="text-[10px] font-medium text-primary">{group.questions.length} questions grouped</span>
                    </div>
                    {group.questions.map(q => (
                      <button
                        key={q.key}
                        type="button"
                        onClick={() => onQuestionClick(q.key)}
                        className={`w-full text-left p-2 rounded-md transition-all ${
                          activeKey === q.key ? 'bg-primary/10' : 'hover:bg-muted/30'
                        }`}
                      >
                        <p className="text-xs font-medium text-foreground truncate pl-7">{q.label}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 pl-7">
                          <span className="text-[10px] text-muted-foreground">{getTypeLabel(q.questionType)}</span>
                          {q.optionCount != null && q.optionCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">• {q.optionCount} opts</span>
                          )}
                          {q.type === 'custom' && (
                            <span className="text-[10px] text-primary font-medium">Custom</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
              {gIndex < resolvedGroups.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowDown className="w-3 h-3 text-muted-foreground/40" />
                </div>
              )}
            </div>
          );
        })}

        {/* Submit card */}
        <div className="flex justify-center py-0.5">
          <ArrowDown className="w-3 h-3 text-muted-foreground/40" />
        </div>
        <div className="w-full p-3 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 text-center">
          <p className="text-xs font-semibold text-primary">Submit</p>
        </div>
      </div>
    </div>
  );
}

function SingleQuestionCard({ question, index, isActive, onClick, getTypeLabel }: {
  question: FlowQuestion;
  index: number;
  isActive: boolean;
  onClick: () => void;
  getTypeLabel: (t: string) => string;
}) {
  return (
    <motion.button
      type="button"
      layout
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
        isActive
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border/40 bg-card/50 hover:border-primary/30'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
          isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}>
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{question.label}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-muted-foreground">{getTypeLabel(question.questionType)}</span>
            {question.optionCount != null && question.optionCount > 0 && (
              <span className="text-[10px] text-muted-foreground">• {question.optionCount} opts</span>
            )}
            {question.type === 'custom' && (
              <span className="text-[10px] text-primary font-medium">Custom</span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}
