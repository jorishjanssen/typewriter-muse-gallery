import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api, type FeedCard, type FeedPage } from './api';

/**
 * Story-level bookmark toggle with optimistic updates across the feed and
 * the saved list. Saving also triages the story (the server stamps it seen),
 * so feed cards flip to read at the same moment.
 */
export function useToggleBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clusterId, bookmarked }: { clusterId: number; bookmarked: boolean }) =>
      bookmarked ? api.bookmark(clusterId) : api.unbookmark(clusterId),
    onMutate: async ({ clusterId, bookmarked }) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      await queryClient.cancelQueries({ queryKey: ['bookmarks'] });
      const feeds = queryClient.getQueriesData<InfiniteData<FeedPage>>({ queryKey: ['feed'] });
      for (const [key, data] of feeds) {
        if (!data) continue;
        queryClient.setQueryData(key, {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            cards: p.cards.map((c) =>
              c.clusterId === clusterId
                ? { ...c, bookmarked, read: bookmarked ? true : c.read }
                : c
            ),
          })),
        });
      }
      const saved = queryClient.getQueryData<{ cards: FeedCard[] }>(['bookmarks']);
      if (saved && !bookmarked) {
        queryClient.setQueryData(['bookmarks'], {
          cards: saved.cards.filter((c) => c.clusterId !== clusterId),
        });
      }
      return { feeds, saved };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.feeds.forEach(([key, data]) => queryClient.setQueryData(key, data));
      if (ctx?.saved) queryClient.setQueryData(['bookmarks'], ctx.saved);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });
}
