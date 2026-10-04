import React from 'react';
import { Modal, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header, colors } from '@kit';

export type Order = { orderId: string; amount: number; keyId: string | null; prefill: { name: string; contact: string; email: string }; bookingCode: string };
type Result = { status: 'success' | 'failed' | 'dismissed'; reason?: string };

/** Razorpay Standard Checkout inside a WebView (works with Expo dev builds and Expo Go). */
export function GatewayCheckout({ order, onResult }: { order: Order | null; onResult: (r: Result) => void }) {
  if (!order) return null;
  const opts = { key: order.keyId, amount: order.amount, currency: 'INR', order_id: order.orderId, name: 'MyRepairUnder100', description: `Booking ${order.bookingCode}`, prefill: order.prefill, theme: { color: colors.blue } };
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
<body style="background:#F5F7FB"><script>
  var send = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var o = ${JSON.stringify(opts)};
  o.handler = function () { send({ status: 'success' }); };
  o.modal = { ondismiss: function () { send({ status: 'dismissed' }); } };
  var rzp = new Razorpay(o);
  rzp.on('payment.failed', function (r) { send({ status: 'failed', reason: r.error && r.error.description }); });
  rzp.open();
</script></body></html>`;
  return (
    <Modal visible animationType="slide" onRequestClose={() => onResult({ status: 'dismissed' })}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Secure payment" onBack={() => onResult({ status: 'dismissed' })} />
        <View style={{ flex: 1 }}>
          <WebView originWhitelist={['*']} source={{ html, baseUrl: 'https://checkout.razorpay.com' }} javaScriptEnabled setSupportMultipleWindows={false}
            onMessage={(e) => { try { onResult(JSON.parse(e.nativeEvent.data)); } catch { /* ignore */ } }} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
