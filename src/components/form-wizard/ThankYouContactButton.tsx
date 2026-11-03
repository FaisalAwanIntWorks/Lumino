import type React from 'react';
import { Phone, MessageCircle, CalendarDays } from 'lucide-react';
import { motion } from 'framer-motion';
import { getThankYouAction, type ThankYouContact } from '@/lib/thank-you-contact';
import { getContrastText } from '@/lib/color-utils';

interface ThankYouContactButtonProps {
  contact: ThankYouContact | null | undefined;
  accentColor: string;
  className?: string;
}

/**
 * Thank-you screen button driven by the client's "How would you like your
 * leads to contact you?" setting. Renders nothing when no method is set.
 * Styled to match DepositCheckoutButton so both sit naturally together.
 */
/** Fallback for embeds where the anchor navigation is swallowed: push the
 *  tel: URL to the top window (same-origin) or the current one. */
function openDialer(href: string) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    try {
      const top = window.top;
      if (top && top !== window) {
        top.location.href = href;
        e.preventDefault();
      }
    } catch {
      // cross-origin top: fall through to the anchor's own target="_top" navigation
    }
  };
}

export function ThankYouContactButton({ contact, accentColor, className }: ThankYouContactButtonProps) {
  const action = getThankYouAction(contact);
  if (!action) return null;

  // Label must stay readable on light accents (e.g. a cream brand colour) —
  // dark accents keep the previous white text. Mirrors DepositCheckoutButton.
  const labelColor = getContrastText(accentColor);

  const Icon = contact?.method === 'schedule'
    ? CalendarDays
    : contact?.method === 'contact'
      ? MessageCircle
      : Phone;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.4 }}
      className={`w-full max-w-sm ${className ?? ''}`}
    >
      <a
        href={action.href}
        // tel: must navigate the top-level window so the phone's dialer opens
        // with the number pre-filled even when the form runs inside the
        // client-site iframe (Safari blocks tel: from a cross-origin frame).
        {...(action.kind === 'link'
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : { target: '_top', onClick: openDialer(action.href) })}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all hover:opacity-90"
        style={{ backgroundColor: accentColor, color: labelColor, boxShadow: `0 0 20px ${accentColor}40` }}
      >
        <Icon className="w-4 h-4" />
        <span>{action.label}</span>
        {action.kind === 'tel' && (
          <span className="normal-case tracking-normal font-semibold opacity-90">· {action.display}</span>
        )}
      </a>
    </motion.div>
  );
}
