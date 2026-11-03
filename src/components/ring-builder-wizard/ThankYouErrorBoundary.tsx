import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  backgroundColor?: string;
  fontColor?: string;
  accentColor?: string;
}

interface State {
  hasError: boolean;
}

// D4: Error boundary so an AI-generation crash doesn't blank the entire
// thank-you page. Customer still sees a friendly confirmation that the lead
// was saved.
export class ThankYouErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('ThankYou render error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const bg = this.props.backgroundColor || '#0a0a0a';
    const font = this.props.fontColor || '#ffffff';
    const accent = this.props.accentColor || '#77bb41';

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 py-10 text-center"
        style={{ backgroundColor: bg, color: font }}
      >
        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight mb-4">
          <span style={{ color: font }}>YOUR DESIGN HAS BEEN </span>
          <span style={{ color: accent }}>SAVED</span>
        </h1>
        <p className="max-w-md text-sm leading-relaxed" style={{ color: `${font}99` }}>
          Our team will be in touch with you shortly about your custom piece.
        </p>
      </div>
    );
  }
}
