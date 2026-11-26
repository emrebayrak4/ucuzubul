// Android App Links. PLACEHOLDER: replace the fingerprint with the release signing SHA-256 from EAS before launch.
export const dynamic = "force-static";

export function GET() {
  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.afterwish.pricora",
        sha256_cert_fingerprints: ["TODO:RELEASE_SHA256_FINGERPRINT_FROM_EAS"],
      },
    },
  ]);
}
