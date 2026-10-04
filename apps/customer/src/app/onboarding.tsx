import React, { useRef, useState } from 'react';
import { Dimensions, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { ApplianceGlyph, Button, Icon, Row, Screen, T, colors, radius } from '@kit';
import { Logo } from '@/components/Logo';
import { useSession } from '@/lib/session';
import { track } from '@/lib/analytics';

const W = Dimensions.get('window').width;
const SLIDES = [
  { icon: 'ac', title: 'AC, fridge, washing machine & microwave', body: 'Book repairs and servicing for your home appliances across Delhi NCR in a few taps.' },
  { icon: 'shield', title: 'Clear prices before we start', body: 'See the price upfront. Anything extra the technician finds needs your approval in the app first.' },
  { icon: 'track', title: 'Track your technician', body: 'Know who is coming and when — with live location while they are on the way.' },
];

export default function Onboarding() {
  const { setOnboarded } = useSession();
  const [i, setI] = useState(0);
  const list = useRef<FlatList>(null);
  const done = async () => { await setOnboarded(); track('app_install'); router.replace('/login'); };
  return (
    <Screen scroll={false} padded={false} bg={colors.white} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo size={30} />
        <Button title="Skip" kind="ghost" size="sm" full={false} onPress={done} />
      </View>
      <FlatList ref={list} data={SLIDES} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(s) => s.title}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / W))}
        renderItem={({ item }) => (
          <View style={{ width: W, padding: 28, justifyContent: 'center', flex: 1 }}>
            <View style={{ height: 260, borderRadius: radius.xl, backgroundColor: colors.blueTint, alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
              {item.icon === 'ac' ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 150, gap: 14, justifyContent: 'center' }}>
                  {['ac', 'fridge', 'washer', 'microwave'].map((k) => <ApplianceGlyph key={k} kind={k} bg={colors.white} box={64} />)}
                </View>
              ) : <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}><Icon name={item.icon === 'shield' ? 'shield-checkmark' : 'navigate'} size={56} color={item.icon === 'shield' ? colors.blue : colors.orange} /></View>}
            </View>
            <T v="display" color={colors.ink}>{item.title}</T>
            <T v="body" color={colors.slate} style={{ marginTop: 12 }}>{item.body}</T>
          </View>
        )} />
      <View style={{ padding: 20, gap: 16 }}>
        <Row justify="center" gap={6}>{SLIDES.map((_, k) => <View key={k} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? colors.blue : colors.line }} />)}</Row>
        <Button title={i === SLIDES.length - 1 ? 'Get started' : 'Next'} onPress={() => (i === SLIDES.length - 1 ? done() : list.current?.scrollToIndex({ index: i + 1 }))} />
      </View>
    </Screen>
  );
}
