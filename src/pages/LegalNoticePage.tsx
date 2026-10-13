import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DISCLOSE_ON_REQUEST, LEGAL_UPDATED, OPERATOR } from '../data/operator';
import { pricingFor } from '../data/pricing';

// 特定商取引法に基づく表記 (the notice Japanese law requires from anyone selling online).
// Have a 税理士 or lawyer check it before launch, in particular whether the prices should be
// shown including consumption tax (税込, assumed below) and how you want to handle refunds.

const NOT_SET = <span className="is-bad">Not set yet (src/data/operator.ts)</span>;
const ON_REQUEST = '請求があった場合、遅滞なく開示します。下記のメールアドレスまでご連絡ください。 / Provided without delay on request by email.';

const set = (value: string, onRequest = false): ReactNode =>
  value ? value : onRequest && DISCLOSE_ON_REQUEST ? ON_REQUEST : NOT_SET;

export function LegalNoticePage() {
  const jp = pricingFor('JP');
  const us = pricingFor('US');
  const rows: [string, string, ReactNode][] = [
    ['販売事業者', 'Seller', set(OPERATOR.name)],
    ['運営責任者', 'Person responsible', set(OPERATOR.representative)],
    [
      '所在地',
      'Address',
      OPERATOR.address && !DISCLOSE_ON_REQUEST ? OPERATOR.address : DISCLOSE_ON_REQUEST ? ON_REQUEST : NOT_SET,
    ],
    [
      '電話番号',
      'Phone',
      OPERATOR.phone && !DISCLOSE_ON_REQUEST ? OPERATOR.phone : DISCLOSE_ON_REQUEST ? ON_REQUEST : NOT_SET,
    ],
    [
      'メールアドレス',
      'Email',
      OPERATOR.email ? <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> : NOT_SET,
    ],
    [
      '販売価格',
      'Prices',
      <>
        <ul>
          {(['boost_post', 'featured_profile', 'studio_listing'] as const).map((t) => (
            <li key={t}>
              {jp[t].name}: {jp[t].price}（税込）／ {jp[t].per}
              <span className="muted"> · outside Japan {us[t].price}</span>
            </li>
          ))}
        </ul>
        <p>
          日本のプロフィールをお持ちの方は円、それ以外の方は米ドルでのお支払いです。ご購入前に購入画面で必ず金額が表示されます。
          “Launch pricing” 表示の価格は導入価格で、今後の新規のご購入については変更することがあります（その場合もお支払い前に表示します）。
        </p>
        <p className="muted">Prices are shown on the purchase screen before you pay. Japan-based profiles pay in yen, everyone else in US dollars.</p>
      </>,
    ],
    [
      '商品代金以外の必要料金',
      'Other charges',
      <>
        なし。ただし、インターネット接続にかかる通信料はお客様のご負担です。
        <span className="muted"> None, apart from your own internet or mobile data costs.</span>
      </>,
    ],
    [
      'お支払い方法',
      'Payment method',
      <>
        クレジットカード・デビットカード（Stripe によるお支払い）。
        <span className="muted"> Credit and debit cards, processed by Stripe.</span>
      </>,
    ],
    [
      'お支払い時期',
      'When you pay',
      <>
        単発のサービス（投稿のブースト）はご購入時にお支払いが確定します。月額のサービス（注目のプロフィール、スタジオ掲載）はご購入時と、以降毎月の更新日にお支払いが発生します。
        <span className="muted"> One-time purchases are charged at checkout; monthly ones at checkout and then on each monthly renewal.</span>
      </>,
    ],
    [
      'サービスの提供時期',
      'When it starts',
      <>
        決済の確認後、ただちに開始します。
        <span className="muted"> Starts right after payment is confirmed.</span>
      </>,
    ],
    [
      'サービスの内容・期間',
      'What you get',
      <>
        <ul>
          <li>投稿のブースト: 投稿を 7 日間、コミュニティの上位に「Promoted」表示で掲載します（単発）。</li>
          <li>注目のプロフィール: 同じ都市で検索された際に優先表示されます（月額・自動更新）。</li>
          <li>スタジオ掲載: 目立つ掲載と「Verified Studio」バッジ（月額・自動更新）。</li>
        </ul>
        <p className="muted">
          Boost: your post shows near the top of Community for 7 days (one-time). Featured profile and Studio listing renew monthly
          until you cancel. Promotions make content more visible; they don’t guarantee views, messages or bookings.
        </p>
      </>,
    ],
    [
      '解約・キャンセル',
      'Cancelling',
      <>
        月額のサービスは「プロモーション」ページからいつでも解約できます。解約しても、お支払い済みの期間の終了まではご利用いただけ、その後自動更新は行われません。
        <span className="muted"> Cancel any time on the Promotions page. It stays on until the end of the period you paid for.</span>
      </>,
    ],
    [
      '返金・返品',
      'Refunds',
      <>
        デジタルサービスの性質上、決済後のお客様都合による返金・キャンセルはお受けしておりません（法令上認められる場合を除きます）。サービスに不具合がある場合は、上記メールアドレスまでご連絡ください。
        <span className="muted"> Because these are digital services, payments aren’t refundable once made, except where the law requires. If something doesn’t work, email us.</span>
      </>,
    ],
    [
      '動作環境',
      'Requirements',
      <>
        最新のウェブブラウザ、または Music Match アプリ（iPhone / Android）と、インターネット接続。
        <span className="muted"> A current web browser or the Music Match app, and an internet connection.</span>
      </>,
    ],
  ];

  return (
    <div className="page legal">
      <header className="page-head">
        <h1>特定商取引法に基づく表記</h1>
        <p className="muted">Legal notice for sellers (Act on Specified Commercial Transactions) · Last updated {LEGAL_UPDATED}</p>
      </header>

      <dl className="legal-table">
        {rows.map(([jp, en, value]) => (
          <div key={jp} className="legal-row">
            <dt>
              {jp}
              <small>{en}</small>
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <p className="legal-foot">
        <Link to="/terms">Terms of Service</Link> · <Link to="/privacy">Privacy Policy</Link> · <Link to="/settings">Back to Settings</Link>
      </p>
    </div>
  );
}
