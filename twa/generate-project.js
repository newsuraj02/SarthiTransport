// Runs only in CI (see .github/workflows/build-twa.yml). Replicates what
// `bubblewrap init` does, minus its interactive terminal prompts — Bubblewrap's
// own `init` command always asks questions on stdin with no flag to skip them,
// which makes it unusable in a CI job. This drives the same underlying
// @bubblewrap/core APIs directly instead, with every value that init would
// have asked for supplied up front from env vars, so the exact host/package
// baked into the app is explicit and reviewable instead of hidden inside a
// third-party website's session state.
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { TwaManifest, TwaGenerator, ConsoleLog, BufferedLog } = require("@bubblewrap/core");

async function main() {
  const manifestUrl = process.env.MANIFEST_URL;
  const packageId = process.env.PACKAGE_ID;
  const keystorePath = process.env.KEYSTORE_PATH;
  const keystoreAlias = process.env.KEYSTORE_ALIAS;
  const appVersionCode = parseInt(process.env.APP_VERSION_CODE, 10);
  const appVersionName = process.env.APP_VERSION_NAME || String(appVersionCode);
  const targetDirectory = path.resolve(process.env.TARGET_DIR || "./project");

  const missing = ["MANIFEST_URL", "PACKAGE_ID", "KEYSTORE_PATH", "KEYSTORE_ALIAS"]
    .filter((k) => !process.env[k]);
  if (missing.length || !appVersionCode) {
    throw new Error(`Missing/invalid required env vars: ${missing.join(", ")}${appVersionCode ? "" : " APP_VERSION_CODE"}`);
  }

  fs.mkdirSync(targetDirectory, { recursive: true });

  const twaManifest = await TwaManifest.fromWebManifest(manifestUrl);

  // Force the identity fields rather than trusting whatever the manifest
  // happens to resolve to — this is the app's existing Play Store listing,
  // so packageId must stay exactly what's already published.
  twaManifest.packageId = packageId;
  twaManifest.appVersionCode = appVersionCode;
  twaManifest.appVersionName = appVersionName;
  twaManifest.signingKey.path = path.resolve(keystorePath);
  twaManifest.signingKey.alias = keystoreAlias;
  // Bubblewrap defaults to minSdkVersion 21, but the CI workflow patches in
  // a newer androidbrowserhelper (see build-twa.yml) that requires 23+ --
  // Android 5.0/5.1 (API 21-22) devices are a negligible sliver of active
  // devices at this point, so raising the floor here is the right trade.
  twaManifest.minSdkVersion = 23;

  const manifestFile = path.join(targetDirectory, "twa-manifest.json");
  await twaManifest.saveToFile(manifestFile);

  const twaGenerator = new TwaGenerator();
  const log = new BufferedLog(new ConsoleLog("generate"));
  await twaGenerator.createTwaProject(targetDirectory, twaManifest, log, () => {});
  log.flush();

  // `bubblewrap build` compares this checksum against twa-manifest.json to
  // decide whether to interactively prompt about regenerating the project —
  // writing it ourselves, matching, keeps that step silent/non-interactive.
  const manifestContents = fs.readFileSync(manifestFile);
  const checksum = crypto.createHash("sha1").update(manifestContents).digest("hex");
  fs.writeFileSync(path.join(targetDirectory, "manifest-checksum.txt"), checksum);

  console.log(`TWA project generated at ${targetDirectory}`);
  console.log(`  host: ${twaManifest.host}`);
  console.log(`  packageId: ${twaManifest.packageId}`);
  console.log(`  versionCode: ${twaManifest.appVersionCode}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
