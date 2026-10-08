import { Link } from 'react-router-dom';

// Plain-language Terms of Service. Have a lawyer (ideally one familiar with Japanese consumer
// law) review this before relying on it.
// Fill these in before launch; the contact section stays hidden until CONTACT is set.
const OPERATOR = 'the operator of Music Match';
const CONTACT = '';
const UPDATED = 'October 8, 2026';

export function TermsPage() {
  return (
    <div className="page legal">
      <header className="page-head">
        <h1>Terms of Service</h1>
        <p className="muted">Last updated {UPDATED}</p>
      </header>

      <p className="legal-lead">
        These Terms are an agreement between you and {OPERATOR} (“Music Match”, “we”, “us”). By creating an account, browsing
        or otherwise using Music Match (the website and the apps), you agree to them. If you don’t agree, please don’t use
        Music Match.
      </p>

      <nav className="legal-toc" aria-label="Contents">
        {SECTIONS.map(([id, title], i) => (
          <a key={id} href={`#${id}`}>
            {i + 1}. {title}
          </a>
        ))}
      </nav>

      <Section n={1} id="service" title="What Music Match is (and isn’t)">
        <p>
          Music Match is a place for artists, producers, videographers, studios, engineers and other music creatives to find
          each other, share posts and talk. <b>We only provide the platform.</b> We are not a party to any deal, booking,
          collaboration, payment or other arrangement you make with another user, and we are not an agent, employer, manager,
          label, studio or broker for anyone.
        </p>
        <ul>
          <li>We don’t check, vet, endorse or guarantee users, their identity, skills, equipment, rates, availability, reviews, location or anything they post.</li>
          <li>We don’t guarantee that any work will be done, delivered, paid for, of a certain quality or on time, or that any song, video or project will succeed.</li>
          <li>
            Anything you agree with another user (prices, deposits, deadlines, splits, credits, ownership of recordings and
            footage, cancellations) is between you and them. We strongly recommend putting it in writing.
          </li>
          <li>You’re responsible for your own taxes, permits, insurance and any licences your work needs.</li>
        </ul>
      </Section>

      <Section n={2} id="eligibility" title="Who can use Music Match">
        <p>
          You must be at least 13 years old. If you’re under 18 (or under the age of adulthood where you live), you need a
          parent or guardian’s permission to use Music Match and to make any purchase, and they accept these Terms for you.
          You can’t use Music Match if we’ve previously removed you or the law doesn’t allow you to.
        </p>
      </Section>

      <Section n={3} id="account" title="Your account">
        <ul>
          <li>Give accurate information and keep it up to date. Don’t pretend to be someone else or a business you don’t represent.</li>
          <li>Keep your password private. You’re responsible for what happens on your account.</li>
          <li>One person per account. Don’t sell, share or transfer your account.</li>
          <li>You can delete your account at any time in Settings.</li>
        </ul>
      </Section>

      <Section n={4} id="content" title="Your content">
        <p>
          You keep ownership of everything you post or send: posts, photos, videos, audio, messages, profile details
          (“your content”). You give us a worldwide, non-exclusive, royalty-free licence to host, store, copy, display, resize
          and distribute your content as needed to run, show and promote Music Match. This ends when you delete the content
          or your account, except for copies other users already have (for example, messages you sent them) and backups we
          keep for a limited time.
        </p>
        <p>
          You promise you have all the rights needed for your content, including for any music, beats, samples, lyrics,
          footage, artwork and people that appear in it, and that it doesn’t break any law or anyone else’s rights. You are
          solely responsible for your content and for what happens because of it. We may remove or hide any content at any
          time, but we have no duty to review content before or after it’s posted.
        </p>
      </Section>

      <Section n={5} id="rules" title="Things you must not do">
        <ul>
          <li>Break the law, or help or encourage anyone else to.</li>
          <li>Post or share content you don’t have the rights to (unlicensed samples, beats, videos, photos or other copyrighted work).</li>
          <li>Harass, threaten, bully, stalk or discriminate against anyone; post hate speech or violent threats.</li>
          <li>Post sexual content involving minors (we report this to the authorities), or sexual or graphic content without consent.</li>
          <li>Scam people: fake profiles or reviews, taking deposits without delivering, phishing, pyramid schemes or fake “opportunities”.</li>
          <li>Share someone else’s private information (address, phone, ID) without their permission.</li>
          <li>Spam, or send unwanted bulk messages or ads outside the paid promotion tools.</li>
          <li>Upload malware, try to break into accounts or our systems, or get around limits or security.</li>
          <li>Scrape, copy or collect data from Music Match by automated means, or use it to build a competing service.</li>
          <li>Use Music Match to sell illegal goods or services.</li>
        </ul>
        <p>We may remove content, limit features, suspend or close accounts that break these rules, with or without notice.</p>
      </Section>

      <Section n={6} id="safety" title="Meeting and working with people">
        <p>
          Music Match is often used to meet people in person (sessions, shoots, studio time). <b>You are responsible for your own
          safety and property.</b> Meet in public or professional places when you can, tell someone where you’re going, check
          studios and people before you visit, and never send money you can’t afford to lose. We aren’t responsible for the
          conduct of any user, online or offline, or for any injury, loss, theft, damage or dispute that comes from meeting or
          working with someone you found on Music Match.
        </p>
      </Section>

      <Section n={7} id="location" title="Location">
        <p>
          By default the map shows only your city. If you choose to show an exact spot (or you’re a studio with an address),
          other people can see it. Studio and meeting locations are provided by users and may be wrong. If you share your
          device location, we use it to show creatives near you. Think before you share where you live or work.
        </p>
      </Section>

      <Section n={8} id="messages" title="Messages and files">
        <p>
          Messages and files are shared with the people you send them to, who can keep or forward them. We don’t monitor
          messages in real time, but we may review them when they’re reported or when we need to protect users, investigate
          abuse or follow the law. Don’t use messages to send passwords, payment card numbers or other sensitive information.
        </p>
      </Section>

      <Section n={9} id="payments" title="Paid promotions">
        <ul>
          <li>Prices are shown before you pay. Prices marked “Launch pricing” are introductory and may change for new purchases; we’ll show the new price before you pay.</li>
          <li>A boosted post is a one-time payment and runs for 7 days.</li>
          <li>Featured profiles and studio listings are monthly subscriptions that renew automatically until you cancel. You can cancel any time on Your promotions; it stays on until the end of the period you’ve paid for and then stops.</li>
          <li>Payments are handled by Stripe. We don’t see or store your full card number. Stripe’s own terms also apply.</li>
          <li>Promotions make your content more visible; they don’t guarantee views, messages, bookings or income.</li>
          <li>Except where the law requires, payments are non-refundable, including for partly used periods or promotions we remove because they broke these Terms.</li>
          <li>Any money you pay to other users for their services is between you and them. Music Match doesn’t process it and can’t refund it.</li>
        </ul>
      </Section>

      <Section n={10} id="third-parties" title="Other services">
        <p>
          Music Match links to and relies on other services, such as payment processing (Stripe), map data
          (© OpenStreetMap contributors, OpenMapTiles) and the social links users add. We don’t control them and aren’t
          responsible for their content, availability or practices.
        </p>
      </Section>

      <Section n={11} id="ours" title="Music Match’s own content">
        <p>
          The Music Match name, logo, design and software belong to us or our licensors. You may use Music Match as these
          Terms allow, but you may not copy, modify or reuse them otherwise without our written permission.
        </p>
      </Section>

      <Section n={12} id="ending" title="Suspending or ending your use">
        <p>
          You can stop using Music Match and delete your account at any time. We may suspend or end your access, or change,
          pause or stop any part of Music Match, at any time, including if you break these Terms, if we need to for legal or
          safety reasons, or if we stop running the service. Sections that by their nature should continue (for example 4, 9,
          13, 14, 15 and 17) continue after your account ends.
        </p>
      </Section>

      <Section n={13} id="disclaimer" title="No guarantees">
        <p>
          Music Match is provided <b>“as is” and “as available”</b>. To the fullest extent the law allows, we make no promises
          or warranties of any kind, express or implied, including that Music Match will be uninterrupted, secure, error-free
          or accurate, or that it will meet your needs, and that any information, user, profile, location or post is reliable.
        </p>
      </Section>

      <Section n={14} id="liability" title="Limits on our liability">
        <p>To the fullest extent the law allows:</p>
        <ul>
          <li>
            We are not liable for anything another user does or fails to do, including unpaid or poor work, no-shows, scams,
            theft, injury, copyright claims or disputes between users.
          </li>
          <li>We are not liable for indirect, incidental, special or consequential losses, or for lost profits, income, data, opportunities or reputation.</li>
          <li>
            Our total liability to you for any claim is limited to the amount you paid us in the 12 months before the claim,
            or ¥10,000 (about US$70) if that is more.
          </li>
        </ul>
        <p>
          Nothing in these Terms limits liability that can’t be limited by law, including liability for our intentional
          misconduct or gross negligence, or rights you have as a consumer under the laws of where you live.
        </p>
      </Section>

      <Section n={15} id="indemnity" title="Your responsibility for claims">
        <p>
          To the extent the law allows, you agree to compensate and protect us (and our team) from claims, losses and costs,
          including reasonable legal fees, that come from your content, your dealings with other users, or your breaking
          these Terms or the law.
        </p>
      </Section>

      <Section n={16} id="changes" title="Changes to these Terms">
        <p>
          We may update these Terms. If a change is significant, we’ll tell you in the app or by email before it takes effect.
          If you keep using Music Match after that, you accept the new Terms; if you don’t agree, you can delete your account.
        </p>
      </Section>

      <Section n={17} id="law" title="Governing law and disputes">
        <p>
          These Terms are governed by the laws of Japan. Any dispute will be handled by the Tokyo District Court as the court
          of first instance with exclusive jurisdiction, unless the consumer protection laws of where you live give you the
          right to bring a claim in your local courts. Please contact us first; most problems can be solved quickly.
        </p>
      </Section>

      {CONTACT && (
        <Section n={18} id="contact" title="Contact">
          <p>
            Questions about these Terms: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </Section>
      )}

      <p className="legal-foot">
        <Link to="/settings">Back to Settings</Link>
      </p>
    </div>
  );
}

const SECTIONS: [string, string][] = [
  ['service', 'What Music Match is (and isn’t)'],
  ['eligibility', 'Who can use Music Match'],
  ['account', 'Your account'],
  ['content', 'Your content'],
  ['rules', 'Things you must not do'],
  ['safety', 'Meeting and working with people'],
  ['location', 'Location'],
  ['messages', 'Messages and files'],
  ['payments', 'Paid promotions'],
  ['third-parties', 'Other services'],
  ['ours', 'Music Match’s own content'],
  ['ending', 'Suspending or ending your use'],
  ['disclaimer', 'No guarantees'],
  ['liability', 'Limits on our liability'],
  ['indemnity', 'Your responsibility for claims'],
  ['changes', 'Changes to these Terms'],
  ['law', 'Governing law and disputes'],
];

function Section({ n, id, title, children }: { n: number; id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="legal-section">
      <h2>
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}
