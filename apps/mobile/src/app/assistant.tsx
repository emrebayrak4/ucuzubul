import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, View } from "react-native";
import type { AssistantMessage, ProductCard } from "@pricora/contracts";
import { ProductRail } from "@/components/product";
import { AppText, Button, Chip, Field, Notice, OfflineBanner, Row } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { tokens, useTheme } from "@/lib/theme";
import { useZip } from "@/lib/zip";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;
const EXAMPLES = ["Best noise-cancelling headphones under $300", "Is this a good time to buy a 65-inch TV?", "Compare the cheapest 16 GB laptops"];

type Turn = AssistantMessage & { products?: ProductCard[] };

/**
 * Experimental shopping assistant (POST /v1/assistant). Prices in answers always come from the catalog; when no AI
 * provider is configured (adapter pending_configuration / 503) the screen says so instead of faking replies.
 */
export default function AssistantScreen() {
  const { c } = useTheme();
  const { zip } = useZip();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const health = useQuery({ queryKey: ["health"], queryFn: ({ signal }) => api.health({ signal }), staleTime: 5 * 60_000 });
  const ai = health.data?.adapters.find((a) => a.kind === "ai");
  const unavailable = ai ? ai.status !== "live" : false;
  const ask = useMutation({
    mutationFn: (messages: AssistantMessage[]) => api.assistant.ask({ messages: messages.slice(-20), context: zip ? { zip } : undefined }),
    onSuccess: (r) => setTurns((t) => [...t, { ...r.message, products: r.products }]),
  });
  const send = (q: string) => {
    const content = q.trim();
    if (!content || ask.isPending) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setText("");
    ask.mutate(next.map(({ role, content: m }) => ({ role, content: m })));
  };
  const disabled = unavailable || (ask.error instanceof ApiError && ask.error.status === 503);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.bg }} keyboardVerticalOffset={90}>
      <OfflineBanner />
      <FlatList
        data={turns}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: GUTTER, gap: sp[3], paddingBottom: sp[6] }}
        ListHeaderComponent={
          <View style={{ gap: sp[3] }}>
            <Notice tone="info">Experimental. Answers can be wrong; prices and stores always come from our catalog, never from the AI.</Notice>
            {disabled ? <Notice tone="warning">The assistant isn’t configured on this server yet (no AI provider connected).</Notice> : null}
            {!turns.length && !disabled ? (
              <Row gap={2} style={{ flexWrap: "wrap" }}>
                {EXAMPLES.map((e) => (
                  <Chip key={e} label={e} onPress={() => send(e)} />
                ))}
              </Row>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ alignItems: item.role === "user" ? "flex-end" : "flex-start", gap: sp[2] }}>
            <View
              style={{
                maxWidth: "88%",
                padding: sp[3],
                borderRadius: tokens.radius.lg,
                backgroundColor: item.role === "user" ? c.primary : c.surface,
                borderWidth: item.role === "user" ? 0 : 1,
                borderColor: c.border,
              }}
            >
              <AppText color={item.role === "user" ? "primary-fg" : "text"} selectable>
                {item.content}
              </AppText>
            </View>
            {item.products?.length ? <ProductRail items={item.products} /> : null}
          </View>
        )}
        ListFooterComponent={
          ask.isPending ? (
            <AppText color="text-muted">Thinking…</AppText>
          ) : ask.isError && !disabled ? (
            <AppText color="error">{errorMessage(ask.error)}</AppText>
          ) : undefined
        }
      />
      <Row gap={2} style={{ padding: GUTTER, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
        <Field
          style={{ flex: 1 }}
          placeholder={disabled ? "Assistant unavailable" : "Ask about products, prices, deals…"}
          value={text}
          onChangeText={setText}
          editable={!disabled}
          onSubmitEditing={() => send(text)}
          returnKeyType="send"
          maxLength={4000}
        />
        <Button title="Send" icon="send" disabled={disabled || !text.trim()} loading={ask.isPending} onPress={() => send(text)} />
      </Row>
    </KeyboardAvoidingView>
  );
}
