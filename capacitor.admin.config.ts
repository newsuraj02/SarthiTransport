import type { CapacitorConfig } from "@capacitor/cli";

// A second, separate native wrapper for Admin only — same live site as
// capacitor.config.ts (see that file's own comment for why server.url mode
// is used at all), but with `?admin=1` appended so the app opens straight
// to Admin Login instead of the Customer/Driver role-select screen (see
// src/App.jsx: RoleSelect's adminEntry/showAdmin logic — the Admin option
// is otherwise invisible unless the URL carries that query param). A
// different appId (com.apnatransport.admin, not .app) means this installs
// as its own separate app, side by side with the real Customer/Driver app
// on the same device, rather than colliding with or updating it.
//
// android.path points cap at android-admin/ instead of the default
// android/ — that folder is otherwise built and versioned exactly like
// the main app's (see .github/workflows/build-capacitor-admin.yml and
// android-admin/app/build.gradle), just under a different applicationId
// and with no google-services.json (Admin was never wired to receive
// push notifications — see functions/index.js — so that file, and the
// Google Services Gradle plugin it would trigger, are simply absent
// there rather than misconfigured for a package name that doesn't match).
//
// This file is a reference only — `npx cap sync android` always reads
// plain `capacitor.config.ts`, so building/resyncing android-admin/ means
// temporarily swapping this in as capacitor.config.ts first (see the CI
// workflow's own "Point Capacitor at the Admin config" step for exactly
// how). Never rename this to capacitor.config.ts permanently — that would
// make android/ (the real Customer/Driver app) sync against Admin's URL
// instead.
const config: CapacitorConfig = {
  appId: "com.apnatransport.admin",
  appName: "Apna Transport Admin",
  webDir: "dist",
  android: {
    path: "android-admin",
  },
  server: {
    url: "https://sarthi-transport-74865.web.app/?admin=1",
    cleartext: false,
  },
};

export default config;
