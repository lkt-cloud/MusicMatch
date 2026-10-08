import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store';
import { Layout } from './components/Layout';
import { MapPage } from './pages/MapPage';
import { FeedPage } from './pages/FeedPage';
import { MessagesPage } from './pages/MessagesPage';
import { ProfilePage } from './pages/ProfilePage';
import { PromotionsPage } from './pages/PromotionsPage';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<MapPage />} />
            <Route path="feed" element={<FeedPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="messages/:id" element={<MessagesPage />} />
            <Route path="u/:id" element={<ProfilePage />} />
            <Route path="me" element={<ProfilePage mine />} />
            <Route path="promotions" element={<PromotionsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  </StrictMode>,
);
