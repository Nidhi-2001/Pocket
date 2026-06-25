import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface VoiceInput {
  recording: boolean;
  busy: boolean; // transcribing
  supported: boolean;
  toggle: () => Promise<void>;
}

/**
 * Voice input for the assistant — NATIVE (iOS/Android) implementation. Records
 * mic audio with expo-audio, reads the file as base64 (expo-file-system), sends
 * it to the `transcribe` edge function (Groq Whisper), and hands the resulting
 * text to `onText`. Web uses `useVoiceInput.web.ts` (MediaRecorder); Metro picks
 * the platform-specific file automatically.
 *
 * NOTE: expo-audio is a native module, so this path only works in a dev/EAS
 * build that bundled it — not in Expo Go and not over-the-air on an old build.
 */
export function useVoiceInput(onText: (text: string) => void): VoiceInput {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  // Native always supports voice once the build includes expo-audio.
  const supported = true;

  async function transcribe(uri: string) {
    setBusy(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { data, error } = await supabase.functions.invoke('transcribe', {
        body: { audio: base64, mimeType: 'audio/m4a' },
      });
      const text = (data as { text?: string } | null)?.text;
      if (!error && text) onText(text);
    } catch (e) {
      console.warn('transcribe error:', e);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      console.warn('mic permission denied');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  }

  async function stop() {
    setRecording(false);
    try {
      await recorder.stop();
    } catch (e) {
      console.warn('mic stop error:', e);
    }
    const uri = recorder.uri;
    if (uri) await transcribe(uri);
  }

  async function toggle() {
    if (busy) return;
    if (recording) {
      await stop();
    } else {
      try {
        await start();
      } catch (e) {
        console.warn('mic start error:', e);
        setRecording(false);
      }
    }
  }

  return { recording, busy, supported, toggle };
}
