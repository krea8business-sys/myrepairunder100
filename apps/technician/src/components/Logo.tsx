import React from 'react';
import { Image, View } from 'react-native';
import { T, colors } from '@kit';

export function Logo({ size = 36, wordmark = true, light = false }: { size?: number; wordmark?: boolean; light?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLabel="MyRepairUnder100">
      <Image source={require('../../assets/images/logo-mark.png')} style={{ width: size * 1.2, height: size }} resizeMode="contain" />
      {wordmark ? (
        <T v="h3" color={light ? colors.white : colors.navy} style={{ fontSize: size * 0.48, letterSpacing: -0.3 }}>
          MyRepair<T v="h3" color={colors.orange} style={{ fontSize: size * 0.48 }}>Under100</T>
        </T>
      ) : null}
    </View>
  );
}
