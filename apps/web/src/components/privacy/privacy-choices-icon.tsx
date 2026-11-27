/**
 * California Privacy Protection Agency / CA AG opt-out preference icon (toggle with check and X), redrawn as inline SVG.
 * Always shown next to the text "Your Privacy Choices" — never on its own.
 */
export function PrivacyChoicesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 14" width="30" height="14" aria-hidden className={className} focusable="false">
      <path d="M7.4 12.8h8.6L19.6 1.2H7.4a5.8 5.8 0 0 0 0 11.6Z" fill="#fff" />
      <path d="M22.6 1.2H19.6L16 12.8h6.6a5.8 5.8 0 0 0 0-11.6Z" fill="#0066FF" />
      <path d="M22.6.5H7.4a6.5 6.5 0 0 0 0 13h15.2a6.5 6.5 0 0 0 0-13Zm0 12.3H16L19.6 1.2h3a5.8 5.8 0 0 1 0 11.6ZM1.6 7a5.8 5.8 0 0 1 5.8-5.8h12.2L16 12.8H7.4A5.8 5.8 0 0 1 1.6 7Z" fill="#0066FF" />
      <path d="M24.6 4.2a.5.5 0 0 1 .1.7L23.4 7l1.3 2.1a.5.5 0 1 1-.8.5l-1.1-1.8-1.1 1.8a.5.5 0 1 1-.8-.5L22.2 7l-1.3-2.1a.5.5 0 1 1 .8-.5l1.1 1.8 1.1-1.8a.5.5 0 0 1 .7-.2Z" fill="#fff" />
      <path d="M12.4 4.3a.5.5 0 0 1 .1.7l-3.2 4.1a.5.5 0 0 1-.8 0L6.8 7.4a.5.5 0 1 1 .7-.7l1.3 1.3 2.9-3.6a.5.5 0 0 1 .7-.1Z" fill="#0066FF" />
    </svg>
  );
}
