import { router } from "expo-router";
import { useState } from "react";
import { HotelSearchQuery } from "@pricora/contracts";
import { DateField, Stepper, isoInDays } from "@/components/travel";
import { AppText, Button, Card, Field, Notice, Screen } from "@/components/ui";
import { tokens } from "@/lib/theme";

const sp = tokens.spacing;

export default function HotelsSearchForm() {
  const [city, setCity] = useState("");
  const [checkin, setCheckin] = useState(isoInDays(14));
  const [checkout, setCheckout] = useState(isoInDays(16));
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = HotelSearchQuery.safeParse({ city, checkin, checkout, guests, rooms });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your search");
      return;
    }
    setError(null);
    router.push({ pathname: "/hotels/search", params: { city: parsed.data.city, checkin, checkout, guests: String(guests), rooms: String(rooms) } });
  };

  return (
    <Screen scroll edges={[]}>
      <Card style={{ marginTop: sp[4], gap: sp[4] }}>
        <Field label="Destination" value={city} onChangeText={setCity} placeholder="City, e.g. Chicago" autoCapitalize="words" returnKeyType="search" onSubmitEditing={submit} />
        <DateField label="Check-in" value={checkin} onChange={setCheckin} quick={[{ label: "Tomorrow", days: 1 }, { label: "In 1 week", days: 7 }, { label: "2 weeks", days: 14 }]} />
        <DateField label="Check-out" value={checkout} onChange={setCheckout} quick={[{ label: "+2 nights", days: 16 }, { label: "+1 week", days: 21 }]} />
        <Stepper label="Guests" value={guests} min={1} max={16} onChange={setGuests} />
        <Stepper label="Rooms" value={rooms} min={1} max={8} onChange={setRooms} />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button title="Search hotels" icon="search" size="lg" onPress={submit} />
      </Card>
      <AppText variant="caption" color="text-muted" style={{ marginTop: sp[4] }}>
        Star class is the hotel category, not a guest rating. We show guest ratings only when a provider supplies real ones.
      </AppText>
    </Screen>
  );
}
