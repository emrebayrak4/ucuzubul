import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Alert, FlatList, View } from "react-native";
import { ProductRow, RowSkeleton } from "@/components/product";
import { AppText, Button, Divider, EmptyState, ErrorState, IconButton } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { money } from "@/lib/format";
import { param } from "@/lib/hooks";
import { LISTS_KEY } from "@/lib/saved";
import { tokens, useTheme } from "@/lib/theme";

export default function ListDetailScreen() {
  const id = param(useLocalSearchParams<{ id: string }>().id) ?? "";
  const { c } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["me", "lists", id], queryFn: ({ signal }) => api.me.lists.get(id, { signal }), enabled: !!id });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.me.lists.removeItem(id, itemId),
    onSuccess: (data) => {
      qc.setQueryData(["me", "lists", id], data);
      void qc.invalidateQueries({ queryKey: LISTS_KEY, exact: true });
    },
    onError: (e) => Alert.alert("Couldn't remove item", errorMessage(e)),
  });
  const removeList = useMutation({
    mutationFn: () => api.me.lists.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LISTS_KEY });
      router.back();
    },
    onError: (e) => Alert.alert("Couldn't delete list", errorMessage(e)),
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: q.data?.name ?? "List" }} />
      {q.isPending ? (
        <RowSkeleton />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={q.data.items}
          keyExtractor={(i) => i.id}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={{ paddingHorizontal: tokens.layout.gutter.base, paddingBottom: tokens.spacing[12] }}
          ListHeaderComponent={
            q.data.estimatedTotalCents !== null ? (
              <AppText variant="label" color="text-muted" style={{ paddingVertical: tokens.spacing[3] }}>
                Estimated total {money(q.data.estimatedTotalCents)}
              </AppText>
            ) : undefined
          }
          renderItem={({ item }) => (
            <ProductRow
              p={item.product}
              right={<IconButton icon="close" label="Remove from list" onPress={() => removeItem.mutate(item.id)} />}
            />
          )}
          ListEmptyComponent={<EmptyState icon="list-outline" title="This list is empty" />}
          ListFooterComponent={
            <Button
              title="Delete list"
              variant="ghost"
              onPress={() =>
                Alert.alert("Delete list?", "This can't be undone.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => removeList.mutate() },
                ])
              }
              style={{ marginTop: tokens.spacing[6] }}
            />
          }
        />
      )}
    </View>
  );
}
