import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import TabBar from './components/TabBar';
import Feed from './pages/Feed';
import Reader from './pages/Reader';
import RaceStage from './pages/RaceStage';
import Races from './pages/Races';
import RiderFeed from './pages/RiderFeed';
import Riders from './pages/Riders';
import Settings from './pages/Settings';

const DAY = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      // Keep cached data long enough to survive app restarts (persisted below),
      // so reopening the PWA paints the last feed instantly while refetching.
      gcTime: DAY,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'echappee-cache',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      // Bump the buster whenever a cached API shape changes incompatibly —
      // stale persisted data otherwise crashes new UI code (e.g. the watch
      // guide redesign reading .options from an old-shape guide).
      persistOptions={{ persister, maxAge: DAY, buster: 'v2' }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/article/:id" element={<Reader />} />
          <Route path="/races" element={<Races />} />
          <Route path="/race/:id" element={<RaceStage />} />
          <Route path="/riders" element={<Riders />} />
          <Route path="/rider/:key" element={<RiderFeed />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        <TabBar />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>
);
