// Runs only in CI, right after generate-project.js (see
// .github/workflows/build-twa.yml). Bubblewrap regenerates the whole
// Android project from scratch on every build -- nothing under
// twa/project is committed to this repo -- so any customization beyond
// what Bubblewrap itself supports has to be reapplied here every time,
// same reasoning as the build.gradle sed patches already in that workflow.
//
// Adds SettingsBridgeActivity: a small native Activity whose only job is
// opening this app's own Notification or Location settings screen
// directly. It exists because Chrome deliberately blocks web content
// (see src/App.jsx) from firing "android.settings.*" intents itself, as
// an anti-phishing measure -- confirmed on a real device, a web page's
// intent:// link straight to ACTION_APP_NOTIFICATION_SETTINGS silently
// does nothing. This app's own native code has no such restriction,
// since it's trusted code calling a system API on itself rather than a
// website asking the browser to do it on the website's behalf. The web
// side reaches this Activity via a custom, app-specific intent action
// (not a system "android.settings.*" one), which Chrome does not filter
// -- see androidSettingsBridgeUrl in src/App.jsx.
const fs = require("fs");
const path = require("path");

function main() {
  const packageId = process.env.PACKAGE_ID;
  const targetDirectory = path.resolve(process.env.TARGET_DIR || "./project");
  if (!packageId) throw new Error("PACKAGE_ID is required");

  const packagePath = packageId.replace(/\./g, "/");
  const javaDir = path.join(targetDirectory, "app/src/main/java", packagePath);
  const activityFile = path.join(javaDir, "SettingsBridgeActivity.java");

  const activitySource = `package ${packageId};

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;

// See twa/patch-project.js (this project is regenerated from scratch on
// every build, so that script -- not this comment -- is the source of
// truth). Opens this app's own Notification settings (or, for anything
// else, its App Info page -- the closest built-in screen to a per-app
// Location toggle) directly, since Chrome itself refuses to let web
// content do this.
public class SettingsBridgeActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String target = getIntent().getStringExtra("target");
        Intent settingsIntent;
        if ("notifications".equals(target)) {
            settingsIntent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            settingsIntent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        } else {
            settingsIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            settingsIntent.setData(Uri.fromParts("package", getPackageName(), null));
        }
        settingsIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (settingsIntent.resolveActivity(getPackageManager()) != null) {
            startActivity(settingsIntent);
        }
        finish();
    }
}
`;

  fs.mkdirSync(javaDir, { recursive: true });
  fs.writeFileSync(activityFile, activitySource);
  console.log(`Wrote ${activityFile}`);

  const manifestPath = path.join(targetDirectory, "app/src/main/AndroidManifest.xml");
  let manifest = fs.readFileSync(manifestPath, "utf8");
  const anchor = `<activity android:name="com.google.androidbrowserhelper.trusted.FocusActivity" />`;
  if (!manifest.includes(anchor)) {
    throw new Error("Could not find FocusActivity anchor in AndroidManifest.xml -- Bubblewrap's generated manifest must have changed; update the anchor in twa/patch-project.js.");
  }
  const activityBlock = `<activity android:name=".SettingsBridgeActivity"
            android:exported="true"
            android:theme="@android:style/Theme.Translucent.NoTitleBar">
            <intent-filter>
                <action android:name="${packageId}.OPEN_SETTINGS" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </activity>

        ${anchor}`;
  manifest = manifest.replace(anchor, activityBlock);
  fs.writeFileSync(manifestPath, manifest);
  console.log("Patched AndroidManifest.xml with SettingsBridgeActivity");
}

main();
