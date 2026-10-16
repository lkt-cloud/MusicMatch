import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store';
import { Layout } from './components/Layout';
import { MapPage } from './pages/MapPage';
import { FeedPage } from './pages/FeedPage';
import { MessagesPage } from './pages/MessagesPage';
import { ProfilePage } from './pages/ProfilePage';
import { PromotionsPage } from './pages/PromotionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { LegalNoticePage } from './pages/LegalNoticePage';
import { BookingsPage } from './pages/BookingsPage';
import { AdminPage } from './pages/AdminPage';
import { registerServiceWorker } from './push';
import { LIVE } from './backend/client';
import { applyAppearance, useSettings } from './settings';
import { resolveLang } from './i18n';
import './styles.css';

applyAppearance();

/** Redraws everything below it when the language changes, so all text switches at once. */
function LanguageRoot({ children }: { children: ReactNode }) {
  const { language } = useSettings();
  return <div key={resolveLang(language)} style={{ display: 'contents' }}>{children}</div>;
}
// Shows push notifications in browsers (see public/sw.js).
if (LIVE) registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <LanguageRoot>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<MapPage />} />
            <Route path="feed" element={<FeedPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="messages/:id" element={<MessagesPage />} />
            <Route path="bookings" element={<BookingsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="u/:id" element={<ProfilePage />} />
            <Route path="me" element={<ProfilePage mine />} />
            <Route path="promotions" element={<PromotionsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="terms" element={<TermsPage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="legal" element={<LegalNoticePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </LanguageRoot>
    </StoreProvider>
  </StrictMode>,
);
