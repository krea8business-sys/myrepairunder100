import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Gap, Header, Screen, T, colors } from '@kit';
import { LEGAL } from '@/lib/legal';

export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: keyof typeof LEGAL }>();
  const d = LEGAL[doc as keyof typeof LEGAL] ?? LEGAL.terms;
  return (
    <Screen padded={false} scroll={false}>
      <Header title={d.title} onBack={() => router.back()} />
      <Screen edges={[]}>
        <Banner tone="warn" title="Template — to be reviewed by your legal advisor before launch" />
        <Gap />
        {d.sections.map(([h, body]) => (
          <React.Fragment key={h}>
            <T v="h3" color={colors.ink} style={{ marginTop: 14 }}>{h}</T>
            <T color={colors.slate} style={{ marginTop: 6 }}>{body}</T>
          </React.Fragment>
        ))}
        <Gap h={40} />
      </Screen>
    </Screen>
  );
}
