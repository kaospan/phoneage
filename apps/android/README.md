# Phoneage Android (Capacitor)

This folder contains the Android wrapper for the Phoneage web app, built with Capacitor.

Capacitor is not a backend stack. It is a native container + plugin bridge that runs your existing web app inside an Android WebView. Your backend (if any) is whatever your web app already uses (REST, WebSocket, Firebase, etc.).

## Prereqs

- Node.js 20+
- Android Studio
- Android SDK + platform tools
- JDK 17

## One-time setup

From repo root:

```powershell
cd apps/android
npm install
npm run cap:add
```

## Sync latest web build into Android

From repo root:

```powershell
npm run build
cd apps/android
npm run sync:web
npm run cap:sync
```

## Open in Android Studio

```powershell
cd apps/android
npm run cap:open
```

