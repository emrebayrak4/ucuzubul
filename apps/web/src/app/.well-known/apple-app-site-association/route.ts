// iOS Universal Links. PLACEHOLDER: replace TEAMID with the Apple Developer Team ID before launch.
// App routes mirror web paths 1:1 (see A03 request in docs/TASKS.md).
const APP_ID = "TODO_TEAMID.com.afterwish.pricora";

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      applinks: {
        details: [
          {
            appIDs: [APP_ID],
            components: [
              { "/": "/products/*", comment: "Product pages" },
              { "/": "/travel/flights*", comment: "Flight search" },
              { "/": "/travel/hotels*", comment: "Hotel search and detail" },
              { "/": "/flights*", comment: "Legacy flight paths (redirect)" },
              { "/": "/hotels*", comment: "Legacy hotel paths (redirect)" },
            ],
          },
        ],
      },
      webcredentials: { apps: [APP_ID] },
    },
    { headers: { "content-type": "application/json" } },
  );
}
