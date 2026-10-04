import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, T, colors, inr, radius, shadow } from '@kit';
import { useCart } from '@/lib/queries';
import { useSession } from '@/lib/session';

/** Floating "View cart" bar — always one tap from checkout. */
export function CartBar({ bottom = 16 }: { bottom?: number }) {
  const { status } = useSession();
  const cart = useCart(status === 'signedIn');
  const n = cart.data?.items.reduce((a, i) => a + i.quantity, 0) ?? 0;
  if (!n) return null;
  return (
    <View style={{ position: 'absolute', left: 16, right: 16, bottom }} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel={`View cart, ${n} items`} onPress={() => router.push('/cart')}
        style={({ pressed }) => [{ backgroundColor: colors.blue, borderRadius: radius.lg, paddingHorizontal: 18, height: 58, flexDirection: 'row', alignItems: 'center', ...shadow.raised }, pressed && { opacity: 0.9 }]}>
        <View style={{ flex: 1 }}>
          <T v="small" color="#C9D6FF">{n} service{n > 1 ? 's' : ''}</T>
          <T v="h3" color={colors.white}>{inr(cart.data?.quote.totalBeforeWallet)}</T>
        </View>
        <T v="h3" color={colors.white}>View cart</T>
        <Icon name="chevron-forward" color={colors.white} />
      </Pressable>
    </View>
  );
}
