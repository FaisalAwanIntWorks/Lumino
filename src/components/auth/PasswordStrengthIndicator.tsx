import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';
import { checkPasswordStrength } from '@/lib/auth-validation';

interface PasswordStrengthIndicatorProps {
  password: string;
}

const strengthColors: Record<number, string> = {
  0: 'bg-muted',
  1: 'bg-destructive',
  2: 'bg-orange-500',
  3: 'bg-amber-500',
  4: 'bg-lime-500',
  5: 'bg-green-500',
};

const strengthLabels: Record<number, string> = {
  0: 'Very Weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
  5: 'Excellent',
};

interface ExtendedPasswordStrengthIndicatorProps extends PasswordStrengthIndicatorProps {
  name?: string;
  phone?: string;
}

export function PasswordStrengthIndicator({ password, name, phone }: ExtendedPasswordStrengthIndicatorProps) {
  const { score, checks } = checkPasswordStrength(password);
  
  // Check for name/phone content
  const containsName = name && name.length >= 3 && 
    password.toLowerCase().replace(/\s+/g, '').includes(name.toLowerCase().replace(/\s+/g, ''));
  
  const containsPhone = phone && phone.length >= 4 && (() => {
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 4) return false;
    for (let i = 0; i <= phoneDigits.length - 4; i++) {
      if (password.includes(phoneDigits.substring(i, i + 4))) return true;
    }
    return false;
  })();

  if (!password) return null;

  const requirements = [
    { key: 'length', label: '9+ characters', valid: checks.length },
    { key: 'uppercase', label: 'Uppercase letter', valid: checks.uppercase },
    { key: 'lowercase', label: 'Lowercase letter', valid: checks.lowercase },
    { key: 'number', label: 'Number', valid: checks.number },
    { key: 'special', label: 'Special character (!@#$%^&*)', valid: checks.special },
    ...(name ? [{ key: 'noName', label: 'Does not contain name', valid: !containsName }] : []),
    ...(phone ? [{ key: 'noPhone', label: 'Does not contain phone', valid: !containsPhone }] : []),
  ];

  return (
    <div className="space-y-3 mt-2">
      {/* Strength bar */}
      <div className="space-y-1">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((level) => (
            <div
              key={level}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-all duration-300',
                level <= score ? strengthColors[score] : 'bg-muted'
              )}
            />
          ))}
        </div>
        <p className={cn(
          'text-xs font-medium transition-colors',
          score <= 2 ? 'text-destructive' : score <= 3 ? 'text-amber-600' : 'text-green-600'
        )}>
          {strengthLabels[score]}
        </p>
      </div>

      {/* Requirements checklist */}
      <ul className="grid grid-cols-1 gap-1 text-xs">
        {requirements.map((req) => (
          <li
            key={req.key}
            className={cn(
              'flex items-center gap-1.5 transition-colors',
              req.valid ? 'text-green-600' : 'text-muted-foreground'
            )}
          >
            {req.valid ? (
              <Check className="h-3 w-3" />
            ) : (
              <X className="h-3 w-3" />
            )}
            {req.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
