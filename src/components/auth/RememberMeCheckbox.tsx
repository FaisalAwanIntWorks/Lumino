import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface RememberMeCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function RememberMeCheckbox({ checked, onCheckedChange, disabled }: RememberMeCheckboxProps) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id="remember-me"
        checked={checked}
        onCheckedChange={(checked) => onCheckedChange(checked === true)}
        disabled={disabled}
      />
      <Label 
        htmlFor="remember-me" 
        className="text-sm text-muted-foreground cursor-pointer select-none"
      >
        Remember me for 7 days
      </Label>
    </div>
  );
}
