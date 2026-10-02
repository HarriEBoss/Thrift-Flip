#!/usr/bin/env python3
"""Idempotently applies Thrift Flip's iOS settings to the Capacitor-generated Xcode project.

Run after `npx cap add ios` (already applied in the committed project):
  python3 scripts/ios-configure.py
"""
import plistlib, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / 'ios' / 'App' / 'App'
info_path = APP / 'Info.plist'
info = plistlib.loads(info_path.read_bytes())

# AdMob: Google's public TEST app id. REPLACE with the real AdMob app id (HUMAN_TODO).
info['GADApplicationIdentifier'] = 'ca-app-pub-3940256099942544~1458002511'
# App Tracking Transparency purpose string (shown before personalised ads are requested).
info['NSUserTrackingUsageDescription'] = (
    'Allowing tracking lets us show ads that are more relevant to you. '
    'Thrift Flip works exactly the same either way.'
)
# SKAdNetwork: Google's own id. Paste Google's full current list (see HUMAN_TODO) before release.
info['SKAdNetworkItems'] = [{'SKAdNetworkIdentifier': 'cstr6suwn9.skadnetwork'}]
# Standard encryption only (HTTPS) -> export compliance exemption.
info['ITSAppUsesNonExemptEncryption'] = False
# Status bar hidden in game (also hidden at runtime via @capacitor/status-bar).
info['UIStatusBarHidden'] = True
# Never lock orientation: every orientation on iPhone and iPad.
info['UISupportedInterfaceOrientations'] = [
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
]
info['UISupportedInterfaceOrientations~ipad'] = [
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationPortraitUpsideDown',
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
]
info['UIRequiredDeviceCapabilities'] = ['arm64']
info['CFBundleDisplayName'] = 'Thrift Flip'
info_path.write_bytes(plistlib.dumps(info))

# Privacy manifest (app-level). Third-party SDKs (Google Mobile Ads, RevenueCat) ship their own
# manifests; Xcode merges them into the privacy report.
privacy = {
    'NSPrivacyTracking': False,
    'NSPrivacyTrackingDomains': [],
    'NSPrivacyCollectedDataTypes': [],
    'NSPrivacyAccessedAPITypes': [
        {
            # @capacitor/preferences stores the save in UserDefaults (app-only access).
            'NSPrivacyAccessedAPIType': 'NSPrivacyAccessedAPICategoryUserDefaults',
            'NSPrivacyAccessedAPITypeReasons': ['CA92.1'],
        }
    ],
}
(APP / 'PrivacyInfo.xcprivacy').write_bytes(plistlib.dumps(privacy))

# Register PrivacyInfo.xcprivacy in the Xcode project (resources build phase).
pbx_path = ROOT / 'ios' / 'App' / 'App.xcodeproj' / 'project.pbxproj'
pbx = pbx_path.read_text()
if 'PrivacyInfo.xcprivacy' not in pbx:
    FILE = 'A1B2C3D4E5F60718293A4B5C'
    BUILD = 'A1B2C3D4E5F60718293A4B5D'
    pbx = pbx.replace(
        '/* Begin PBXBuildFile section */\n',
        '/* Begin PBXBuildFile section */\n'
        f'\t\t{BUILD} /* PrivacyInfo.xcprivacy in Resources */ = {{isa = PBXBuildFile; fileRef = {FILE} /* PrivacyInfo.xcprivacy */; }};\n',
        1,
    )
    pbx = pbx.replace(
        '/* Begin PBXFileReference section */\n',
        '/* Begin PBXFileReference section */\n'
        f'\t\t{FILE} /* PrivacyInfo.xcprivacy */ = {{isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; }};\n',
        1,
    )
    # Add to the App group (next to config.xml) and the Resources phase.
    pbx = re.sub(r'(\n(\t+)[0-9A-F]{24} /\* config\.xml \*/,\n)', lambda m: m.group(1) + f'{m.group(2)}{FILE} /* PrivacyInfo.xcprivacy */,\n', pbx, count=1)
    pbx = re.sub(r'(\n(\t+)[0-9A-F]{24} /\* config\.xml in Resources \*/,\n)', lambda m: m.group(1) + f'{m.group(2)}{BUILD} /* PrivacyInfo.xcprivacy in Resources */,\n', pbx, count=1)
    pbx_path.write_text(pbx)
print('iOS project configured')
