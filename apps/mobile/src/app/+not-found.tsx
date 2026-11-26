import { Stack, router } from "expo-router";
import { EmptyState, Screen } from "@/components/ui";

export default function NotFound() {
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: "Not found" }} />
      <EmptyState icon="compass-outline" title="Page not found" message="This link doesn't match anything in the app." action={{ label: "Go home", onPress: () => router.replace("/") }} />
    </Screen>
  );
}
