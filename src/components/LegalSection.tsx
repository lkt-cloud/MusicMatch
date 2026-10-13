import type { ReactNode } from 'react';

// Numbered section used by the Privacy Policy (the Terms page has its own copy).
export function LegalSection({ n, id, title, children }: { n: number; id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="legal-section">
      <h2>
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}
