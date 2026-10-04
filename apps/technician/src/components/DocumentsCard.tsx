import React, { useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { Badge, Banner, Button, Card, Row, T, api, colors, errorMessage } from '@kit';

const TYPES = [['ID_PROOF', 'ID proof'], ['ADDRESS_PROOF', 'Address proof'], ['PHOTO', 'Profile photo'], ['SKILL_CERT', 'Skill / training certificate']] as const;

export async function uploadImage(path: string, field: string, extra: Record<string, string>, camera = false) {
  const pick = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
  if (camera) { const p = await ImagePicker.requestCameraPermissionsAsync(); if (!p.granted) throw new Error('Camera permission is needed to take photos.'); }
  const r = await pick({ mediaTypes: ['images'], quality: 0.6, allowsEditing: false });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const form = new FormData();
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  if (Platform.OS === 'web') form.append(field, await (await fetch(a.uri)).blob(), a.fileName ?? 'photo.jpg');
  else form.append(field, { uri: a.uri, name: a.fileName ?? 'photo.jpg', type: a.mimeType ?? 'image/jpeg' } as unknown as Blob);
  return api(path, { form, timeoutMs: 60_000 });
}

export function DocumentsCard() {
  const me = useQuery({ queryKey: ['techMe'], queryFn: () => api<{ documents: { id: string; type: string; status: string }[] }>('/technician/me') });
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  return (
    <Card>
      <T v="h3" color={colors.ink} style={{ marginBottom: 8 }}>Documents</T>
      {TYPES.map(([k, l]) => {
        const d = me.data?.documents.filter((x) => x.type === k).at(-1);
        return (
          <Row key={k} justify="space-between" style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
            <T style={{ flex: 1 }}>{l}</T>
            {d ? <Badge label={d.status} fg={d.status === 'VERIFIED' ? colors.success : d.status === 'REJECTED' ? colors.danger : colors.warning} bg={d.status === 'VERIFIED' ? colors.successTint : d.status === 'REJECTED' ? colors.dangerTint : colors.warningTint} /> : null}
            <Button title={d ? 'Replace' : 'Upload'} size="sm" kind="secondary" full={false} style={{ marginLeft: 8 }} loading={busy === k}
              onPress={async () => { setBusy(k); setErr(null); try { await uploadImage('/technician/documents', 'file', { type: k }); await me.refetch(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); } }} />
          </Row>
        );
      })}
      {err ? <Banner tone="danger" title={err} /> : null}
    </Card>
  );
}
