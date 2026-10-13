// Who runs Music Match. Fill these in before launch: they appear on the Terms, Privacy Policy
// and 特定商取引法に基づく表記 pages. Anything left empty shows up as "Not set yet" on the
// legal-notice page, so it can't slip out unnoticed.

export const OPERATOR = {
  /** Business or trade name, as registered on your 開業届. */
  name: '',
  /** Person responsible for the service (運営責任者). */
  representative: '',
  /** Postal address. If you'd rather not publish it, set DISCLOSE_ON_REQUEST below instead. */
  address: '',
  phone: '',
  /** Where people send questions and abuse reports. */
  email: '',
};

/**
 * Japanese law lets a seller who runs from home publish the address and phone number
 * "without delay on request" instead of printing them. Set true to do that (you still need
 * to provide them when someone emails and asks).
 */
export const DISCLOSE_ON_REQUEST = false;

export const SITE = 'https://music-match-beige.vercel.app';
export const LEGAL_UPDATED = 'October 12, 2026';
