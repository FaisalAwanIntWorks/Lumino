import { useTheme } from 'next-themes';
import logoLight from '@/assets/branding/logo-full-light-v2.png';
import logoWhite from '@/assets/branding/logo-full-white.png';

interface ThemedLogoProps {
  className?: string;
  alt?: string;
}

export function ThemedLogo({ className = 'h-12 w-auto', alt = 'JewlX' }: ThemedLogoProps) {
  const { resolvedTheme } = useTheme();
  const logo = resolvedTheme === 'dark' ? logoWhite : logoLight;

  return <img src={logo} alt={alt} className={className} />;
}
