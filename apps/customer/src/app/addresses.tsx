import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Confirm, EmptyState, ErrorState, Gap, Header, Icon, Row, Screen, SkeletonList, T, api, colors } from '@kit';
import { qk, useAddresses } from '@/lib/queries';

export default function Addresses() {
  const q = useAddresses();
  const qc = useQueryClient();
  const [del, setDel] = useState<string | null>(null);
  return (
    <Screen padded={false} scroll={false}>
      <Header title="Saved addresses" onBack={() => router.back()} />
      <Screen edges={[]}>
        {q.isLoading ? <SkeletonList rows={2} /> : q.isError ? <ErrorState message="Unable to load addresses." onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState icon="home-outline" title="No saved addresses" action="Add address" onAction={() => router.push('/address-form')} /> : <>
          {q.data.map((a) => (
            <Card key={a.id} style={{ marginBottom: 12 }}>
              <Row align="flex-start" gap={12}>
                <Icon name={a.label === 'WORK' ? 'briefcase-outline' : a.label === 'HOME' ? 'home-outline' : 'location-outline'} color={colors.blue} />
                <View style={{ flex: 1 }}>
                  <Row gap={8}><T v="bodyStrong">{a.label.charAt(0) + a.label.slice(1).toLowerCase()}</T>{a.isDefault ? <T v="tiny" color={colors.blue}>DEFAULT</T> : null}</Row>
                  <T v="small" color={colors.slate}>{[a.houseNo, a.street, a.locality, a.city, a.pincode].filter(Boolean).join(', ')}</T>
                  {!a.serviceability.serviceable ? <T v="small" color={colors.danger}>{a.serviceability.message}</T> : null}
                </View>
              </Row>
              <Gap h={10} />
              <Row gap={8}>
                <Button title="Edit" kind="secondary" size="sm" full={false} onPress={() => router.push({ pathname: '/address-form', params: { id: a.id } })} />
                <Button title="Delete" kind="danger" size="sm" full={false} onPress={() => setDel(a.id)} />
              </Row>
            </Card>
          ))}
          <Button title="Add new address" icon="add" kind="ghost" onPress={() => router.push('/address-form')} />
        </>}
        <Gap h={20} />
      </Screen>
      <Confirm visible={!!del} title="Delete this address?" danger confirm="Delete" onCancel={() => setDel(null)} onConfirm={async () => { await api(`/me/addresses/${del}`, { method: 'DELETE' }); setDel(null); qc.invalidateQueries({ queryKey: qk.addresses }); }} />
    </Screen>
  );
}
