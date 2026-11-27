import { buildLlmsTxt, textResponse } from "@/lib/llms";

export const dynamic = "force-dynamic";

export async function GET() {
  return textResponse(await buildLlmsTxt(true));
}
