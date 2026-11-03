import { useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { CustomEnquiryConfiguratorPanel, type CustomEnquiryConfiguratorPanelProps } from './CustomEnquiryConfiguratorPanel';
import { FlowPreview, type FlowQuestion, type FlowQuestionGroup } from '@/components/ring-form-config/FlowPreview';

interface CustomEnquiryFormConfiguratorProps extends CustomEnquiryConfiguratorPanelProps {}

export function CustomEnquiryFormConfigurator(props: CustomEnquiryFormConfiguratorProps) {
  const isMobile = useIsMobile();
  const { steps, enabledSteps, stepOrder, customQuestions, stepGroups, activeKey, onActiveKeyChange } = props;

  const flowQuestions: FlowQuestion[] = useMemo(() => {
    const result: FlowQuestion[] = [];
    const orderedKeys: string[] = [];
    const seenCustom = new Set<string>();
    // Translate legacy custom_${i} keys to stable custom_q_${question_key}
    for (const k of stepOrder) {
      if (k.startsWith('custom_q_')) {
        orderedKeys.push(k);
        seenCustom.add(k);
      } else if (k.startsWith('custom_')) {
        const i = parseInt(k.split('_')[1]);
        const q = customQuestions[i];
        if (q) {
          const stable = `custom_q_${q.question_key}`;
          orderedKeys.push(stable);
          seenCustom.add(stable);
        }
      } else {
        orderedKeys.push(k);
      }
    }
    customQuestions.forEach(q => {
      const stable = `custom_q_${q.question_key}`;
      if (!seenCustom.has(stable)) orderedKeys.push(stable);
    });

    for (const key of orderedKeys) {
      if (key.startsWith('custom_q_')) {
        const stableKey = key.slice('custom_q_'.length);
        const q = customQuestions.find(cq => cq.question_key === stableKey);
        if (!q || !q.is_enabled) continue;
        result.push({ key, label: q.question_text, questionType: q.question_type, optionCount: q.options.length, type: 'custom' });
      } else {
        if (enabledSteps[key] === false) continue;
        const stepDef = steps.find(s => s.key === key);
        if (!stepDef) continue;
        result.push({ key, label: stepDef.label, questionType: 'selection', type: 'default_step' });
      }
    }
    return result;
  }, [stepOrder, customQuestions, enabledSteps, steps]);

  const flowGroups: FlowQuestionGroup[] = useMemo(() => {
    if (!stepGroups || stepGroups.length === 0) {
      return flowQuestions.map(q => ({ questions: [q] }));
    }

    const groups: FlowQuestionGroup[] = [];
    const placed = new Set<string>();

    for (const group of stepGroups) {
      const questionsInGroup = group
        .map(key => flowQuestions.find(q => q.key === key))
        .filter((q): q is FlowQuestion => !!q);
      if (questionsInGroup.length > 0) {
        groups.push({ questions: questionsInGroup });
        questionsInGroup.forEach(q => placed.add(q.key));
      }
    }

    for (const q of flowQuestions) {
      if (!placed.has(q.key)) {
        groups.push({ questions: [q] });
      }
    }

    return groups;
  }, [flowQuestions, stepGroups]);

  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-hidden">
          <CustomEnquiryConfiguratorPanel {...props} />
        </div>
        <div className="h-48 border-t border-border/50 overflow-hidden bg-muted/20">
          <FlowPreview groups={flowGroups} activeKey={activeKey} onQuestionClick={k => onActiveKeyChange(k)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-[60%] border-r border-border/50 overflow-hidden">
        <CustomEnquiryConfiguratorPanel {...props} />
      </div>
      <div className="w-[40%] overflow-hidden bg-muted/10">
        <FlowPreview groups={flowGroups} activeKey={activeKey} onQuestionClick={k => onActiveKeyChange(k)} />
      </div>
    </div>
  );
}
