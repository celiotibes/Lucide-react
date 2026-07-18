import { useState, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';

export function useAudio() {
  const [recording, setRecording] = useState(false);
  const [permissoes, setPermissoes] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    solicitarPermissao();
  }, []);

  const solicitarPermissao = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      setPermissoes(granted);

      if (granted) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }
    } catch (erro) {
      console.error('Erro ao solicitar permissão de áudio:', erro);
    }
  };

  const iniciarGravacao = async () => {
    if (!permissoes) {
      await solicitarPermissao();
      return;
    }

    try {
      const gravacao = new Audio.Recording();
      await gravacao.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await gravacao.startAsync();
      recordingRef.current = gravacao;
      setRecording(true);
    } catch (erro) {
      console.error('Erro ao iniciar gravação:', erro);
    }
  };

  const pararGravacao = async (): Promise<{
    uri: string;
    duracao: number;
  } | null> => {
    if (!recordingRef.current) return null;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const { sound, status } = await recordingRef.current.createNewLoadedSoundAsync();

      if (!status.isLoaded) return null;

      const nomeArquivo = `audio_${uuidv4()}.m4a`;
      const caminhoLocal = `${FileSystem.documentDirectory}vistorias/${nomeArquivo}`;

      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory}vistorias`,
        { intermediates: true }
      );

      const uri = recordingRef.current.getURI();
      if (uri) {
        await FileSystem.copyAsync({
          from: uri,
          to: caminhoLocal,
        });
      }

      await sound.unloadAsync();
      recordingRef.current = null;
      setRecording(false);

      return {
        uri: caminhoLocal,
        duracao: (status.durationMillis || 0) / 1000,
      };
    } catch (erro) {
      console.error('Erro ao parar gravação:', erro);
      recordingRef.current = null;
      setRecording(false);
      return null;
    }
  };

  const transcreverAudio = async (caminhoAudio: string): Promise<string | null> => {
    try {
      // Placeholder para integração com OpenAI Whisper API
      // Será implementado com auth token e upload do arquivo
      // const formData = new FormData();
      // formData.append('file', { uri: caminhoAudio, type: 'audio/m4a', name: 'audio.m4a' });
      // formData.append('model', 'whisper-1');
      //
      // const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      //   method: 'POST',
      //   headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      //   body: formData,
      // });
      //
      // const resultado = await response.json();
      // return resultado.text || null;

      console.log('Transcrição de áudio não implementada ainda');
      return null;
    } catch (erro) {
      console.error('Erro ao transcrever áudio:', erro);
      return null;
    }
  };

  return {
    recording,
    permissoes,
    iniciarGravacao,
    pararGravacao,
    transcreverAudio,
    solicitarPermissao,
  };
}
