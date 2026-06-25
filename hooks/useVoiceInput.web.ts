import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

interface VoiceInput {
  recording: boolean;
  busy: boolean; // transcribing
  supported: boolean;
  toggle: () => Promise<void>;
}

/**
 * Voice input for the assistant — WEB implementation. Records mic audio with
 * MediaRecorder, sends it to the `transcribe` edge function (Groq Whisper), and
 * hands the resulting text to `onText` (the assistant input). The native build
 * uses `useVoiceInput.ts` (expo-audio); Metro picks this `.web.ts` file for web.
 */
export function useVoiceInput(onText: (text: string) => void): VoiceInput {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const supported =
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  async function transcribe(blob: Blob) {
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const { data, error } = await supabase.functions.invoke('transcribe', {
        body: { audio: base64, mimeType: blob.type || 'audio/webm' },
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      await transcribe(blob);
    };
    recorderRef.current = mr;
    mr.start();
    setRecording(true);
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function toggle() {
    if (!supported || busy) return;
    if (recording) {
      stop();
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
