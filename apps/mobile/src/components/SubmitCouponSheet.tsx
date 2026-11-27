import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, View } from "react-native";
import type { CouponDiscountType } from "@pricora/contracts";
import { api, errorMessage } from "@/lib/api";
import { haptic } from "@/lib/format";
import { tokens } from "@/lib/theme";
import { Sheet } from "./Sheet";
import { AppText, Chip, Field, Row } from "./ui";

const TYPES: { value: CouponDiscountType; label: string }[] = [
  { value: "percent", label: "% off" },
  { value: "amount", label: "$ off" },
  { value: "free_shipping", label: "Free shipping" },
  { value: "bogo", label: "BOGO" },
  { value: "other", label: "Other" },
];

const dollars = (s: string) => {
  const n = Number.parseFloat(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined;
};

/**
 * Community coupon submission (POST /v1/coupons, signed in). New codes start "unverified" until real "worked"
 * reports confirm them; a duplicate store+code returns the existing coupon.
 */
export function SubmitCouponSheet({ visible, onClose, defaultStore }: { visible: boolean; onClose: () => void; defaultStore?: string }) {
  const qc = useQueryClient();
  const retailers = useQuery({ queryKey: ["retailers"], queryFn: ({ signal }) => api.catalog.retailers({ signal }), staleTime: 60 * 60_000, enabled: visible });
  const [store, setStore] = useState<string | undefined>(defaultStore);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CouponDiscountType>("percent");
  const [value, setValue] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [storeQ, setStoreQ] = useState("");

  const codeOk = code === "" || /^[A-Za-z0-9_-]{2,40}$/.test(code);
  const valueNum =
    type === "percent" ? (Number(value) > 0 && Number(value) <= 100 ? Math.round(Number(value) * 100) : undefined) : type === "amount" ? dollars(value) : undefined;
  const valid = !!store && title.trim().length >= 4 && codeOk && (type !== "percent" && type !== "amount" ? true : valueNum !== undefined);

  const submit = useMutation({
    mutationFn: () =>
      api.coupons.submit({
        retailerSlug: store!,
        code: code.trim() || null,
        title: title.trim(),
        discountType: type,
        discountValue: valueNum ?? null,
        minSpendCents: dollars(minSpend) ?? null,
      }),
    onSuccess: (c) => {
      haptic.success();
      void qc.invalidateQueries({ queryKey: ["coupons"] });
      onClose();
      Alert.alert("Thanks!", c.status === "unverified" || c.status === "pending_approval" ? "Your coupon was submitted. It shows as unverified until shoppers confirm it works." : "This coupon is already listed.");
    },
    onError: (e) => Alert.alert("Couldn't submit", errorMessage(e)),
  });

  const stores = (retailers.data?.items ?? []).filter((r) => !storeQ || r.name.toLowerCase().includes(storeQ.toLowerCase()));

  return (
    <Sheet visible={visible} onClose={onClose} title="Submit a coupon" primary={{ label: "Submit", disabled: !valid, loading: submit.isPending, onPress: () => submit.mutate() }}>
      <AppText color="text-muted">Share a code that worked for you. Don’t post codes that are private, employee-only or from a gift card.</AppText>
      <AppText variant="label">Store</AppText>
      <Field placeholder="Search stores" value={storeQ} onChangeText={setStoreQ} autoCorrect={false} />
      <Row gap={2} style={{ flexWrap: "wrap" }}>
        {stores.slice(0, storeQ ? 20 : 12).map((r) => (
          <Chip key={r.slug} label={r.name} selected={store === r.slug} onPress={() => setStore(r.slug)} />
        ))}
      </Row>
      <Field label="Code (leave empty for a no-code deal)" value={code} onChangeText={(v) => setCode(v.replace(/\s/g, "").toUpperCase())} autoCapitalize="characters" maxLength={40} error={codeOk ? null : "Letters, numbers, - and _ only (2–40)"} />
      <Field label="What does it give?" placeholder="e.g. 15% off headphones" value={title} onChangeText={setTitle} maxLength={160} />
      <Row gap={2} style={{ flexWrap: "wrap" }}>
        {TYPES.map((t) => (
          <Chip key={t.value} label={t.label} selected={type === t.value} onPress={() => setType(t.value)} />
        ))}
      </Row>
      {type === "percent" || type === "amount" ? (
        <Field label={type === "percent" ? "Percent off" : "Dollars off"} keyboardType="decimal-pad" value={value} onChangeText={setValue} />
      ) : null}
      <View style={{ gap: tokens.spacing[1] }}>
        <Field label="Minimum spend (optional, $)" keyboardType="decimal-pad" value={minSpend} onChangeText={setMinSpend} />
      </View>
    </Sheet>
  );
}
