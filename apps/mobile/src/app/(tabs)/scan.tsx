import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Offer, ScanResponse } from "@pricora/contracts";
import { StoreMark } from "@/components/common";
import { CouponCard, CouponChip } from "@/components/CouponCard";
import { Sheet } from "@/components/Sheet";
import { ProductImage } from "@/components/product";
import { AppText, Button, Card, DealScoreBadge, DemoBadge, EmptyState, Field, Notice, OfflineBanner, PressableRow, Row } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { analyticsCodeType, isValidGtin, normalizeScannedCode } from "@/lib/barcode";
import { haptic, money } from "@/lib/format";
import { openOffer } from "@/lib/links";
import { useTabBarSpace } from "@/lib/tabBar";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;

export default function ScanScreen() {
  const tabSpace = useTabBarSpace();
  const { c } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [shelf, setShelf] = useState("");
  const lock = useRef(false);

  // Only run the camera while the tab is focused (battery + privacy).
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );

  const lookup = useMutation({
    mutationFn: (code: string) => api.scan.lookup(code),
    onSuccess: (res, code) => {
      track("scan_performed", { result: res.status, codeType: analyticsCodeType(code) });
      if (res.status === "not_found") haptic.warning();
    },
    onError: () => {
      lock.current = false;
    },
  });

  const run = (code: string) => {
    if (!isValidGtin(code)) {
      track("scan_performed", { result: "invalid", codeType: analyticsCodeType(code) });
      setManualError("That doesn't look like a valid UPC/EAN (check digit mismatch).");
      lock.current = false;
      return;
    }
    setManualError(null);
    lookup.mutate(code);
  };

  const onScanned = (r: BarcodeScanningResult) => {
    if (lock.current || lookup.isPending) return;
    lock.current = true;
    haptic.success();
    run(normalizeScannedCode(r.type, r.data));
  };

  const reset = () => {
    lookup.reset();
    setShelf("");
    lock.current = false;
  };

  const result = lookup.data;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ padding: tokens.layout.gutter.base, gap: sp[4], paddingBottom: tabSpace }} keyboardShouldPersistTaps="handled">
        <AppText variant="h2" accessibilityRole="header">
          Scan a barcode
        </AppText>

        {result || lookup.isError ? null : (
          <View
            style={{
              height: 280,
              borderRadius: tokens.radius.lg,
              overflow: "hidden",
              backgroundColor: c["surface-2"],
              borderWidth: 1,
              borderColor: c.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {!permission ? null : permission.granted ? (
              active ? (
                <>
                  <CameraView
                    style={{ position: "absolute", inset: 0 }}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["upc_a", "ean13", "ean8"] }}
                    onBarcodeScanned={lookup.isPending ? undefined : onScanned}
                  />
                  <View
                    pointerEvents="none"
                    style={{ width: "75%", height: 110, borderRadius: tokens.radius.md, borderWidth: 2, borderColor: c.accent }}
                  />
                  <View pointerEvents="none" style={{ position: "absolute", bottom: sp[3] }}>
                    <AppText variant="label" style={{ color: "#FFFFFF" }}>
                      {lookup.isPending ? "Looking up…" : "Point at a UPC or EAN barcode"}
                    </AppText>
                  </View>
                </>
              ) : null
            ) : (
              <View style={{ alignItems: "center", gap: sp[3], padding: sp[4] }}>
                <Ionicons name="camera-outline" size={36} color={c["text-muted"]} />
                <AppText style={{ textAlign: "center" }}>
                  Allow camera access to scan product barcodes. Images never leave your device; only the code is looked up.
                </AppText>
                {permission.canAskAgain ? (
                  <Button title="Allow camera" onPress={() => void requestPermission()} />
                ) : (
                  <Button title="Open Settings" variant="secondary" onPress={() => void Linking.openSettings()} />
                )}
              </View>
            )}
          </View>
        )}

        {lookup.isError ? (
          <Card style={{ gap: sp[2] }}>
            <Notice tone="error">{errorMessage(lookup.error)}</Notice>
            <Button title="Scan again" onPress={reset} />
          </Card>
        ) : null}

        {result?.status === "not_found" ? <NotFound result={result} onReset={reset} /> : null}
        {result?.status === "found" ? <Found result={result} shelf={shelf} setShelf={setShelf} onReset={reset} /> : null}

        {!result ? (
          <Card style={{ gap: sp[2] }}>
            <AppText variant="label">Enter a code manually</AppText>
            <Row gap={2} style={{ alignItems: "flex-start" }}>
              <Field
                style={{ flex: 1 }}
                value={manual}
                onChangeText={(v) => setManual(v.replace(/\D/g, ""))}
                placeholder="UPC / EAN (8, 12 or 13 digits)"
                keyboardType="number-pad"
                maxLength={14}
                error={manualError}
                accessibilityLabel="Barcode number"
                onSubmitEditing={() => run(manual)}
              />
              <Button title="Look up" onPress={() => run(manual)} disabled={manual.length < 8} loading={lookup.isPending} style={{ marginTop: 2 }} />
            </Row>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function NotFound({ result, onReset }: { result: Extract<ScanResponse, { status: "not_found" }>; onReset: () => void }) {
  return (
    <Card>
      <EmptyState
        icon="help-circle-outline"
        title="We don't know this product yet"
        message={`${result.message} (${result.code})`}
        action={{ label: "Scan another", onPress: onReset }}
      />
      <Button title="Search by name instead" variant="ghost" onPress={() => router.push("/search")} />
    </Card>
  );
}

function Found({
  result,
  shelf,
  setShelf,
  onReset,
}: {
  result: Extract<ScanResponse, { status: "found" }>;
  shelf: string;
  setShelf: (v: string) => void;
  onReset: () => void;
}) {
  const { card, offers } = result;
  const best = [...offers].sort((a, b) => a.estimatedTotalCents - b.estimatedTotalCents)[0];
  const shelfCents = Math.round(Number.parseFloat(shelf.replace(/[^0-9.]/g, "")) * 100);
  const savings = best && Number.isFinite(shelfCents) && shelfCents > 0 ? shelfCents - best.estimatedTotalCents : null;

  return (
    <Card style={{ gap: sp[3] }}>
      <Row gap={3} style={{ alignItems: "flex-start" }}>
        <ProductImage uri={card.image?.url} size={88} alt={card.image?.alt} />
        <View style={{ flex: 1, gap: sp[1] }}>
          <AppText variant="label" numberOfLines={3}>
            {card.title}
          </AppText>
          <AppText variant="caption" color="text-muted">
            {result.codeType} {result.code}
          </AppText>
          <Row gap={1} style={{ flexWrap: "wrap" }}>
            {card.dealScore !== null ? <DealScoreBadge score={card.dealScore} /> : null}
            {card.hasDemoData ? <DemoBadge /> : null}
          </Row>
        </View>
      </Row>

      {best ? (
        <View style={{ gap: sp[1] }}>
          <AppText variant="overline" color="text-muted">
            Lowest online (est. total)
          </AppText>
          <AppText variant="priceLg">{money(best.estimatedTotalCents, best.currency)}</AppText>
          <AppText variant="caption" color="text-muted">
            at {best.retailer.name} · {offers.length} {offers.length === 1 ? "store" : "stores"}
          </AppText>
          {best.source === "demo" ? <DemoBadge /> : null}
        </View>
      ) : (
        <AppText color="text-muted">No online offers right now.</AppText>
      )}

      {best ? (
        <Field
          label="Price on the shelf (optional)"
          placeholder="e.g. 49.99"
          keyboardType="decimal-pad"
          value={shelf}
          onChangeText={setShelf}
          hint="We compare it with the lowest online total."
        />
      ) : null}
      {best && savings !== null ? (
        savings > 0 ? (
          <Notice tone="info">
            <AppText variant="label">
              Found a lower price online · Save {money(savings, best.currency)} at {best.retailer.name}
            </AppText>
          </Notice>
        ) : (
          <AppText variant="caption" color="text-muted">
            The shelf price is the same or lower than the best online total.
          </AppText>
        )
      ) : null}

      {best ? <Button title={`Visit ${best.retailer.name}`} icon="open-outline" onPress={() => void openOffer(best.id, best.retailer.name, "app_scan")} /> : null}

      <CheaperStores offers={offers} shelfCents={Number.isFinite(shelfCents) && shelfCents > 0 ? shelfCents : null} />
      <ScanCoupons slug={card.slug} />
      <Row gap={3}>
        <Button
          title="All offers"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: "/products/[slug]", params: { slug: card.slug } })}
        />
        <Button title="Scan another" variant="secondary" style={{ flex: 1 }} onPress={onReset} />
      </Row>
    </Card>
  );
}

/** Up to 4 cheapest stores; with a shelf price, only stores that beat it (with the saving). */
function CheaperStores({ offers, shelfCents }: { offers: Offer[]; shelfCents: number | null }) {
  const sorted = [...offers].sort((a, b) => a.estimatedTotalCents - b.estimatedTotalCents);
  const list = (shelfCents !== null ? sorted.filter((o) => o.estimatedTotalCents < shelfCents) : sorted).slice(0, 4);
  if (offers.length < 2 && shelfCents === null) return null;
  return (
    <View style={{ gap: sp[1] }}>
      <AppText variant="overline" color="text-muted">
        {shelfCents !== null ? `Cheaper than the shelf (${list.length})` : "Cheapest stores"}
      </AppText>
      {list.length === 0 ? (
        <AppText variant="caption" color="text-muted">
          No store beats the shelf price right now.
        </AppText>
      ) : (
        list.map((o) => (
          <PressableRow key={o.id} onPress={() => void openOffer(o.id, o.retailer.name, "app_scan_list")} accessibilityLabel={`${o.retailer.name}, ${money(o.estimatedTotalCents, o.currency)}`}>
            <Row gap={2} style={{ paddingVertical: sp[1.5] }}>
              <StoreMark name={o.retailer.name} logoUrl={o.retailer.logoUrl} brandColor={o.retailer.brandColor} size={28} />
              <AppText style={{ flex: 1 }} numberOfLines={1}>
                {o.retailer.name}
              </AppText>
              {o.source === "demo" ? <DemoBadge /> : null}
              <View style={{ alignItems: "flex-end" }}>
                <AppText variant="priceSm">{money(o.estimatedTotalCents, o.currency)}</AppText>
                {shelfCents !== null ? (
                  <AppText variant="caption" color="price-drop">
                    save {money(shelfCents - o.estimatedTotalCents, o.currency)}
                  </AppText>
                ) : null}
              </View>
            </Row>
          </PressableRow>
        ))
      )}
    </View>
  );
}

/** Coupons that apply to the scanned product (from the product detail endpoint). */
function ScanCoupons({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["product", slug, null], queryFn: ({ signal }) => api.catalog.product(slug, undefined, { signal }) });
  const coupons = q.data?.coupons ?? [];
  if (!coupons.length) return null;
  return (
    <View style={{ gap: sp[2] }}>
      <AppText variant="overline" color="text-muted">
        Coupons ({coupons.length})
      </AppText>
      <Row gap={2} style={{ flexWrap: "wrap" }}>
        {coupons.slice(0, 4).map((cp) => (
          <CouponChip key={cp.id} coupon={cp} onPress={() => setOpen(true)} />
        ))}
      </Row>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Coupons for this product">
        {coupons.map((cp) => (
          <CouponCard key={cp.id} coupon={cp} />
        ))}
      </Sheet>
    </View>
  );
}
