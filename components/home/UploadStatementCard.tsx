import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { shadows } from '../../constants/theme';
import { GlassView } from '../ui/GlassView';
import { supabase } from '../../lib/supabase';

interface UploadStatementCardProps {
  onSuccess: () => void;
}

type Stage = 'idle' | 'picking' | 'uploading' | 'parsing';

interface ParseResult {
  inserted: number;
  skipped: number;
  total: number;
  message?: string;
}

export function UploadStatementCard({ onSuccess }: UploadStatementCardProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== 'idle';

  async function pickAndUpload() {
    setStage('picking');
    setError(null);
    setResult(null);

    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: false,
        copyToCacheDirectory: true,
      });
    } catch (e: any) {
      setStage('idle');
      setError(`Couldn't open file picker: ${e?.message ?? e}`);
      return;
    }

    if (picked.canceled || !picked.assets || picked.assets.length === 0) {
      setStage('idle');
      return;
    }

    const file = picked.assets[0];
    if (!file.name?.toLowerCase().endsWith('.pdf')) {
      setStage('idle');
      setError('Please pick a PDF file.');
      return;
    }

    setStage('uploading');

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStage('idle');
      setError('Not signed in.');
      return;
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${timestamp}-${safeName}`;

    // Read file bytes — file.file is set on web, file.uri on native.
    let bytes: ArrayBuffer;
    try {
      if ((file as any).file) {
        bytes = await (file as any).file.arrayBuffer();
      } else if (file.uri) {
        const resp = await fetch(file.uri);
        bytes = await resp.arrayBuffer();
      } else {
        throw new Error('No file body');
      }
    } catch (e: any) {
      setStage('idle');
      setError(`Couldn't read the file: ${e?.message ?? e}`);
      return;
    }

    const { error: uploadErr } = await supabase.storage
      .from('statements')
      .upload(storagePath, bytes, {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (uploadErr) {
      setStage('idle');
      setError(`Upload failed: ${uploadErr.message}`);
      return;
    }

    const { data: uploadRow, error: insErr } = await supabase
      .from('statement_uploads')
      .insert({
        user_id: user.id,
        filename: file.name,
        storage_path: storagePath,
        status: 'pending',
      })
      .select()
      .single();

    if (insErr || !uploadRow) {
      setStage('idle');
      setError(`Couldn't record upload: ${insErr?.message ?? 'unknown'}`);
      return;
    }

    setStage('parsing');

    const { data, error: fnErr } = await supabase.functions.invoke(
      'parse-statement',
      { body: { uploadId: uploadRow.id, storagePath } },
    );

    setStage('idle');

    if (fnErr) {
      const ctx = (fnErr as { context?: unknown }).context;
      if (ctx instanceof Response) {
        const body = await ctx.json().catch(() => null);
        const parts = [
          body?.error ?? `HTTP ${ctx.status}`,
          body?.status ? `groq status ${body.status}` : null,
          body?.detail ? `detail: ${String(body.detail).slice(0, 200)}` : null,
          body?.pdfTextLength
            ? `pdf text len: ${body.pdfTextLength}`
            : null,
        ].filter(Boolean);
        setError(parts.join(' • '));
      } else {
        setError(fnErr.message ?? String(fnErr));
      }
      return;
    }

    setResult(data as ParseResult);
    onSuccess();
  }

  return (
    <GlassView className="rounded-3xl p-5" style={shadows.sm}>
      <View className="flex-row items-center gap-2 mb-2">
        <Ionicons name="document-text-outline" size={18} color="#2563EB" />
        <Text className="text-sm font-bold text-text-primary">
          Upload a credit card statement
        </Text>
      </View>
      <Text className="text-xs text-text-secondary mb-3 leading-relaxed">
        Pick any credit card or bank statement PDF. We&apos;ll parse every
        transaction and skip duplicates already imported from SMS.
      </Text>
      <Pressable
        onPress={pickAndUpload}
        disabled={busy}
        className={`flex-row items-center justify-center gap-2 py-3 rounded-xl ${
          busy
            ? 'bg-text-muted'
            : 'bg-primary active:opacity-80'
        }`}
      >
        {busy ? (
          <>
            <ActivityIndicator size="small" color="white" />
            <Text className="text-white font-semibold text-sm">
              {stage === 'picking'
                ? 'Opening file picker…'
                : stage === 'uploading'
                  ? 'Uploading PDF…'
                  : 'Parsing with AI…'}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={16} color="white" />
            <Text className="text-white font-semibold text-sm">
              Choose PDF
            </Text>
          </>
        )}
      </Pressable>

      {result && (
        <View className="mt-3 px-3 py-2.5 bg-surface-soft rounded-xl">
          <Text className="text-sm text-success font-semibold">
            ✓ Imported {result.inserted} transaction
            {result.inserted !== 1 ? 's' : ''}
          </Text>
          {result.skipped > 0 && (
            <Text className="text-xs text-text-secondary mt-0.5">
              Skipped {result.skipped} duplicate
              {result.skipped !== 1 ? 's' : ''} (already imported via SMS)
            </Text>
          )}
          {result.message && result.inserted === 0 && (
            <Text className="text-xs text-text-secondary mt-0.5">
              {result.message}
            </Text>
          )}
        </View>
      )}

      {error && (
        <Text className="text-danger text-xs mt-3 leading-relaxed">
          {error}
        </Text>
      )}
    </GlassView>
  );
}
