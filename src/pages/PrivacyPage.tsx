import { Link } from 'react-router-dom';
import { LegalSection as Section } from '../components/LegalSection';
import { LEGAL_UPDATED, OPERATOR } from '../data/operator';
import { lang, t } from '../i18n';

// Plain-language Privacy Policy, written to match what the app actually does today.
// Have a lawyer (ideally one who knows Japan's APPI) review it, and update it whenever the
// app starts collecting something new (push notification tokens, analytics, a new service…).
const OPERATOR_NAME = OPERATOR.name || 'the operator of Music Match';

const SECTIONS: [string, string][] = [
  ['collect', 'What we collect'],
  ['use', 'How we use it'],
  ['visible', 'Who can see what'],
  ['providers', 'Services that help us run Music Match'],
  ['location', 'Location'],
  ['device', 'Cookies and storage on your device'],
  ['keep', 'How long we keep it'],
  ['rights', 'Your choices and rights'],
  ['security', 'Security'],
  ['children', 'Children'],
  ['changes', 'Changes to this policy'],
  ['contact', 'Contact'],
];

export function PrivacyPage() {
  return (
    <div className="page legal">
      <header className="page-head">
        <h1>Privacy Policy</h1>
        <p className="muted">Last updated {LEGAL_UPDATED}</p>
      </header>
      {lang() === 'ja' && (
        <p className="legal-lang-note">この{t('Privacy Policy')}は現在英語版のみです。日本語版は準備中です。</p>
      )}

      <p className="legal-lead">
        This explains what personal information {OPERATOR_NAME} (“Music Match”, “we”, “us”) collects through the website and
        the apps, why, and what you can do about it. We don’t sell your personal information and we don’t show
        advertising.
      </p>

      <nav className="legal-toc" aria-label="Contents">
        {SECTIONS.map(([id, title], i) => (
          <a key={id} href={`#${id}`}>
            {i + 1}. {title}
          </a>
        ))}
      </nav>

      <Section n={1} id="collect" title="What we collect">
        <ul>
          <li>
            <b>Account:</b> your email address and password (we never see the password itself; it’s stored scrambled by our
            sign-in provider).
          </li>
          <li>
            <b>Profile:</b> what you add: name, handle, roles, rates, genres, bio, links, profile picture and banner, city and
            country, and, only if you choose, an exact map spot. Studios can add a street address.
          </li>
          <li>
            <b>What you post and send:</b> posts, photos, videos, audio and files, comments, likes, and messages with the
            files in them.
          </li>
          <li>
            <b>Payments:</b> when you buy a promotion, Stripe takes your card details directly. We receive only the result
            (paid, active, cancelled), what you bought and a Stripe customer reference. We never see or store your card number.
          </li>
          <li>
            <b>Booking times:</b> the time frames you add as open for bookings, and any you send in messages.
          </li>
          <li>
            <b>Bookings:</b> requests you send or receive (the time, what it’s for, your note) and whether they’re confirmed,
            declined or cancelled. Only you and the other person can see them.
          </li>
          <li>
            <b>Notifications:</b> if you turn them on, a code for your phone or browser so we can send them, your time zone so
            reminders arrive at the right local time, and which kinds you want. We keep a list of the notifications we sent you.
          </li>
          <li>
            <b>Online status:</b> while you have Music Match open, whether you’re online right now. We don’t keep a history
            of it, and you can hide it in Settings.
          </li>
          <li>
            <b>Safety:</b> who you block, and the reports you send us (what you reported, why, and anything you write).
          </li>
          <li>
            <b>Technical data:</b> like any website, our hosts and providers see your IP address, device and browser type and
            the pages and files you request, in server logs.
          </li>
        </ul>
        <p>You can browse as a guest without an account. We then collect only the technical data above.</p>
      </Section>

      <Section n={2} id="use" title="How we use it">
        <ul>
          <li>To run Music Match: show your profile on the map, your posts in Community, deliver your messages.</li>
          <li>To take payment for promotions and show them while they’re active.</li>
          <li>To keep people safe: handle reports and blocks, find and remove spam, scams and content that breaks the Terms, and follow the law.</li>
          <li>To fix problems, keep the service secure and improve it.</li>
          <li>To email you about your account (for example confirming your email address or resetting your password). We don’t send marketing email.</li>
        </ul>
      </Section>

      <Section n={3} id="visible" title="Who can see what">
        <ul>
          <li>
            <b>Public:</b> your profile, booking times, posts, comments, likes and the reviews you write or receive can be seen by anyone, including people who aren’t signed
            in. Don’t put anything there you want to keep private.
          </li>
          <li>
            <b>Online status:</b> signed-in people can see whether you’re online, unless you turn it off in Settings.
          </li>
          <li>
            <b>Messages and message files:</b> only you and the person you’re talking to. They can keep or forward what you
            send. We don’t monitor messages, but we may look at them if they’re reported or when we need to protect users or
            follow the law.
          </li>
          <li>
            <b>Your email, blocks and reports:</b> not shown to other users. The person you report isn’t told it was you.
          </li>
        </ul>
      </Section>

      <Section n={4} id="providers" title="Services that help us run Music Match">
        <p>We share information with these providers only so they can do their job for us:</p>
        <ul>
          <li><b>Supabase:</b> database, sign-in, file storage and live updates. Everything you add to Music Match is stored there.</li>
          <li><b>Vercel:</b> hosts the website.</li>
          <li><b>Stripe:</b> payments for promotions.</li>
          <li><b>Expo and your browser’s push service (Apple, Google or Mozilla):</b> deliver notifications to your phone or browser. They receive the notification text.</li>
          <li><b>OpenFreeMap / OpenStreetMap:</b> map pictures (your device asks them for map tiles, so they see your IP address and the area you’re looking at) and address look-ups (when a studio types an address, the text is sent to find it on the map).</li>
          <li><b>Fontshare:</b> the fonts we use (your IP address is visible to them when fonts load).</li>
        </ul>
        <p>
          These providers may handle data in other countries, including the United States, where privacy laws can differ from
          Japan’s. We choose providers that protect it, and we don’t share personal information with anyone else except where the
          law requires, to protect someone’s safety, or if Music Match is ever transferred to a new owner (we’d tell you).
        </p>
        <p>Links to other sites and services (such as the social profiles people add) have their own privacy practices.</p>
      </Section>

      <Section n={5} id="location" title="Location">
        <p>
          By default your profile shows only your city. You can choose to show an exact spot, and studios show the address they
          enter; anyone can see these. If you allow your device’s location, we use it to show creatives near you and to
          calculate distances. We don’t keep your device’s location unless you tell us to use it as your map spot. You can
          turn location off in your phone’s or browser’s settings at any time.
        </p>
      </Section>

      <Section n={6} id="device" title="Cookies and storage on your device">
        <p>
          We use your browser’s or phone’s storage (not advertising cookies) to keep you signed in, and to remember your
          settings, the map style you picked, your sample-mode data and that we’ve already asked for your location. We
          don’t use advertising or cross-site tracking. If you turn off “Keep me signed in on this device”, your sign-in is
          forgotten when you close the browser.
        </p>
      </Section>

      <Section n={7} id="keep" title="How long we keep it">
        <p>
          We keep your information while you have an account. When you delete your account in Settings, we delete your profile,
          posts, comments, likes, messages, files, blocks and reports you sent, and cancel any subscription. Copies already
          held by other people (for example messages you sent them) and short-term backups may remain for a while. Payment
          records may be kept by Stripe and by us for as long as tax and accounting law requires. We may keep limited
          information about accounts removed for abuse, to stop them coming back.
        </p>
      </Section>

      <Section n={8} id="rights" title="Your choices and rights">
        <ul>
          <li>Edit your profile, change your email or password, and delete your account in <Link to="/settings">Settings</Link>.</li>
          <li>You can ask us to tell you what personal information we hold about you, and to correct it, stop using it or delete it. Email us (below) and we’ll respond without unreasonable delay.</li>
          <li>You can ask us to stop sending account emails, apart from ones we need to send, such as password resets.</li>
          <li>If you’re in the EU, UK or another place with similar rights (access, portability, objection, complaint to a regulator), you have them too.</li>
        </ul>
      </Section>

      <Section n={9} id="security" title="Security">
        <p>
          Traffic is encrypted, access to data is limited by account, and private message files can be opened only by the two
          people in the conversation. No service is perfectly secure, so please use a strong, unique password and tell us if
          you think your account was accessed by someone else.
        </p>
      </Section>

      <Section n={10} id="children" title="Children">
        <p>
          Music Match isn’t for children under 13, and we don’t knowingly collect their information. If you think a child has
          signed up, tell us and we’ll delete the account.
        </p>
      </Section>

      <Section n={11} id="changes" title="Changes to this policy">
        <p>
          If we change this policy we’ll update the date above, and for significant changes we’ll tell you in the app or by
          email before they take effect.
        </p>
      </Section>

      <Section n={12} id="contact" title="Contact">
        <p>
          {OPERATOR.email ? (
            <>
              Questions or requests about your information: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
            </>
          ) : (
            <span className="is-bad">Not set yet. Add an email address in src/data/operator.ts before launch.</span>
          )}
        </p>
      </Section>

      <p className="legal-foot">
        <Link to="/terms">Terms of Service</Link> · <Link to="/legal">特定商取引法に基づく表記</Link> ·{' '}
        <Link to="/settings">Back to Settings</Link>
      </p>
    </div>
  );
}
