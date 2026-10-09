// Music Match's app: a full-screen, native shell around the Music Match website, so the
// app and the site are always the same. Links that leave Music Match (socials, payments,
// directions) open in the phone's browser or the right app instead of inside this one.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

const SITE = 'https://music-match-beige.vercel.app';
const BG = '#0d0e0c';
const ACCENT = '#e2b04a';

/** Pages that belong inside the app; everything else opens outside it. */
const isOurs = (url: string) => url.startsWith(SITE) || url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:');

type Look = { theme: 'dark' | 'light'; background: string };

export default function App() {
  // The site tells us when it switches between dark and light (Settings → Appearance), so the
  // status bar and the edges around the page match it.
  const [look, setLook] = useState<Look>({ theme: 'dark', background: BG });
  return (
    <SafeAreaProvider>
      <StatusBar style={look.theme === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={[styles.screen, { backgroundColor: look.background }]} edges={['top', 'bottom']}>
        <Site onLook={setLook} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/**
 * The site asks for the location through us (src/location.ts) so the phone's own permission is
 * used: asked once, remembered, instead of the web view prompting on every launch.
 * `prompt` is false when the map just opened and we've asked before: then we only answer if
 * permission is already granted.
 */
async function nativeLocation(prompt: boolean): Promise<{ coords?: [number, number]; error?: 'denied' | 'unavailable' }> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && prompt && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { error: 'denied' };
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { coords: [pos.coords.longitude, pos.coords.latitude] };
  } catch {
    return { error: 'unavailable' };
  }
}

function Site({ onLook }: { onLook: (look: Look) => void }) {
  const web = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  // Android's back button goes back a page in Music Match before leaving the app.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      web.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onNavigation = useCallback((nav: WebViewNavigation) => setCanGoBack(nav.canGoBack), []);

  const shouldLoad = useCallback((req: ShouldStartLoadRequest) => {
    if (isOurs(req.url)) return true;
    // Only hand off links the person actually opened, not things embedded in the page.
    if (req.isTopFrame !== false) Linking.openURL(req.url).catch(() => undefined);
    return false;
  }, []);

  if (failed)
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Can’t reach Music Match</Text>
        <Text style={styles.text}>Check your internet connection and try again.</Text>
        <Pressable
          style={styles.button}
          onPress={() => {
            setFailed(false);
            setLoading(true);
          }}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={styles.screen}>
      <WebView
        ref={web}
        source={{ uri: SITE }}
        style={styles.web}
        originWhitelist={['https://*', 'about:*', 'data:*', 'blob:*']}
        onShouldStartLoadWithRequest={shouldLoad}
        onNavigationStateChange={onNavigation}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { type?: string; id?: string; prompt?: boolean } & Partial<Look>;
            if (msg.type === 'theme' && (msg.theme === 'dark' || msg.theme === 'light') && msg.background)
              onLook({ theme: msg.theme, background: msg.background });
            if (msg.type === 'location' && typeof msg.id === 'string') {
              const id = msg.id;
              nativeLocation(msg.prompt !== false).then((result) => {
                const detail = JSON.stringify({ id, ...result });
                web.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('mm-location', { detail: ${detail} })); true;`);
              });
            }
          } catch {
            // not one of ours
          }
        }}
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        // Lets the site tell it's running inside the app.
        applicationNameForUserAgent="MusicMatchApp/1.0"
        // The map handles its own pinches; the page itself shouldn't zoom or bounce.
        bounces={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        contentInsetAdjustmentBehavior="never"
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        geolocationEnabled
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        pullToRefreshEnabled={false}
        textInteractionEnabled
      />
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ActivityIndicator color={ACCENT} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: BG },
  title: { color: '#f1eee6', fontSize: 20, fontWeight: '700' },
  text: { color: '#a19f97', fontSize: 15, textAlign: 'center' },
  button: { marginTop: 8, backgroundColor: ACCENT, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: '#1a1408', fontWeight: '700', fontSize: 15 },
});
