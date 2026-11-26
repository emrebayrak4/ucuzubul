import { router } from "expo-router";
import { useState } from "react";
import { FlightSearchQuery, type CabinClass } from "@pricora/contracts";
import { AirportField, DateField, Stepper, isoInDays } from "@/components/travel";
import { AppText, Button, Card, Chip, Notice, Row, Screen, Segmented } from "@/components/ui";
import { tokens } from "@/lib/theme";

const sp = tokens.spacing;
const CABINS: { value: CabinClass; label: string }[] = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium" },
  { value: "business", label: "Business" },
  { value: "first", label: "First" },
];

export default function FlightsSearchForm() {
  const [trip, setTrip] = useState<"round_trip" | "one_way">("round_trip");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [depart, setDepart] = useState(isoInDays(14));
  const [ret, setRet] = useState(isoInDays(21));
  const [adults, setAdults] = useState(1);
  const [cabin, setCabin] = useState<CabinClass>("economy");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const input = { from, to, depart, return: trip === "round_trip" ? ret : undefined, adults, cabin };
    const parsed = FlightSearchQuery.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your search");
      return;
    }
    setError(null);
    router.push({
      pathname: "/flights/search",
      params: { from: parsed.data.from, to: parsed.data.to, depart, ...(parsed.data.return ? { return: parsed.data.return } : {}), adults: String(adults), cabin },
    });
  };

  return (
    <Screen scroll edges={[]}>
      <Card style={{ marginTop: sp[4], gap: sp[4] }}>
        <Segmented
          options={[
            { value: "round_trip", label: "Round trip" },
            { value: "one_way", label: "One way" },
          ]}
          value={trip}
          onChange={setTrip}
        />
        <AirportField label="From" value={from} onChange={setFrom} />
        <AirportField label="To" value={to} onChange={setTo} />
        <DateField label="Depart" value={depart} onChange={setDepart} quick={[{ label: "In 1 week", days: 7 }, { label: "2 weeks", days: 14 }, { label: "1 month", days: 30 }]} />
        {trip === "round_trip" ? (
          <DateField label="Return" value={ret} onChange={setRet} quick={[{ label: "+1 week", days: 21 }, { label: "+2 weeks", days: 28 }]} />
        ) : null}
        <Stepper label="Adults" value={adults} min={1} max={9} onChange={setAdults} />
        <Row gap={2} style={{ flexWrap: "wrap" }}>
          {CABINS.map((c) => (
            <Chip key={c.value} label={c.label} selected={cabin === c.value} onPress={() => setCabin(c.value)} />
          ))}
        </Row>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button title="Search flights" icon="search" size="lg" onPress={submit} />
      </Card>
      <AppText variant="caption" color="text-muted" style={{ marginTop: sp[4] }}>
        Fares come from connected providers only. When a provider isn’t connected we say so — we never show made-up fares.
      </AppText>
    </Screen>
  );
}
