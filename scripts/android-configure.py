#!/usr/bin/env python3
"""Idempotently applies Thrift Flip's Android settings to the Capacitor-generated Gradle project.

Run after `npx cap add android` (already applied in the committed project):
  python3 scripts/android-configure.py
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / 'android' / 'app'
manifest_path = APP / 'src' / 'main' / 'AndroidManifest.xml'
m = manifest_path.read_text()

# AdMob: Google's public TEST app id. REPLACE with the real AdMob Android app id (SUBMISSION_ANDROID.md).
# Without this meta-data the Google Mobile Ads SDK stops the app at launch.
ADMOB_ID = 'ca-app-pub-3940256099942544~3347511713'
admob = f'<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="{ADMOB_ID}" />'
if 'com.google.android.gms.ads.APPLICATION_ID' in m:
    m = re.sub(r'<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID"[^>]*/>', admob, m)
else:
    m = m.replace('    </application>', f'        {admob}\n    </application>', 1)

# Every orientation (the game lays out for portrait, landscape and square), and resizable windows
# (split screen, foldables, Chromebooks).
if 'android:screenOrientation' not in m:
    m = m.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="fullUser"', 1)
if 'android:resizeableActivity' not in m:
    m = m.replace('android:supportsRtl="true"', 'android:supportsRtl="true"\n        android:resizeableActivity="true"', 1)
# Saves live in app storage; keep them out of cloud backups so a restore never mixes old progress.
m = m.replace('android:allowBackup="true"', 'android:allowBackup="false"')
manifest_path.write_text(m)

# Version from package.json: versionName = "x.y.z", versionCode = x*10000 + y*100 + z.
pkg = json.loads((ROOT / 'package.json').read_text())
x, y, z = (int(n) for n in pkg['version'].split('.')[:3])
gradle_path = APP / 'build.gradle'
g = gradle_path.read_text()
g = re.sub(r'versionCode \d+', f'versionCode {x * 10000 + y * 100 + z}', g)
g = re.sub(r'versionName "[^"]*"', f'versionName "{x}.{y}.{z}"', g)
gradle_path.write_text(g)

# App name shown under the icon.
strings_path = APP / 'src' / 'main' / 'res' / 'values' / 'strings.xml'
s = strings_path.read_text()
s = re.sub(r'<string name="app_name">[^<]*</string>', '<string name="app_name">Thrift Flip</string>', s)
s = re.sub(r'<string name="title_activity_main">[^<]*</string>', '<string name="title_activity_main">Thrift Flip</string>', s)
strings_path.write_text(s)
print('Android project configured')
