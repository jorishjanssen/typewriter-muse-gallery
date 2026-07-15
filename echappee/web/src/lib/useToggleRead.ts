import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api, type FeedPage } from './api';

/**
 * Cluster-level read toggle with optimistic updates across every cached
 * feed query (main feed, rider feeds), rolled back on error.
 */
export function useToggleRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clusterId, read }: { clusterId: number; read: boolean }) =>
      read ? api.markClusterRead(clusterId) : api.markClusterUnread(clusterId),
    onMutate: async ({ clusterId, read }) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const snapshots = queryClient.getQueriesData<InfiniteData<FeedPage>>({ queryKey: ['feed'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData(key, {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            cards: p.cards.map((c) =>
              c.clusterId === clusterId
                ? {
                    ...c,
                    read,
                    article: { ...c.article, read },
                    alternates: c.alternates.map((alt) => ({ ...alt, read })),
                  }
                : c
            ),
          })),
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });
}
