/**
 * Built-in DTT heading + sub-heading for each Quote Estimator option step.
 * Used both as the render-time fallback in the step components and as the
 * placeholder text in the admin editor, so the wording stays single-sourced.
 * An empty `subtitle` means the step has no sub-heading by default (a client
 * can still add one from the config screen).
 */
export interface DttStepHeading {
  title: string;
  subtitle: string;
}

export const DEFAULT_DTT_STEP_HEADINGS: Record<string, DttStepHeading> = {
  nature: { title: 'Would you like natural or lab diamonds?', subtitle: '' },
  shape: { title: 'What diamond shape would you like?', subtitle: '' },
  size: { title: 'Select your ring diamond size?', subtitle: "Don't worry, we'll perfect the exact ratio and dimensions together." },
  quality: { title: 'Select your diamond quality?', subtitle: '' },
  setting: { title: 'Which ring setting appeals to you?', subtitle: 'Pick the setting that best matches your vision.' },
  holder: { title: 'How should the diamond be held?', subtitle: 'Choose how your diamond sits and is held in place.' },
  band: { title: 'What type of band do you prefer?', subtitle: '' },
  band_width: { title: 'Which band width do you prefer?', subtitle: '' },
  metal: { title: 'Which type of ring metal do you prefer?', subtitle: '' },
  // Sub-screen shown right after the metal choice (only when that metal has
  // karat / purity variants configured). `{metal}` is replaced by the metal name.
  metal_karat: { title: 'Which karat would you like for your {metal}?', subtitle: '' },
  // Two Tone sub-screen: pick the two metals, then the gold karat.
  two_tone: { title: 'Which two metals would you like to combine?', subtitle: 'Then choose the gold karat — it applies to both gold parts.' },
  personalization: { title: 'Any features to personalize your ring?', subtitle: 'Select as many as you want.' },
  ring_size: { title: 'What is your ring size?', subtitle: '' },
  timeline: { title: 'When do you need this by?', subtitle: 'Our average timeline is 4-8 weeks, Depends on your design!' },
};
