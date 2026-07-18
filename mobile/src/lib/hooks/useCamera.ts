import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';

export function useCamera() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [recording, setRecording] = useState(false);

  const capturaFoto = async () => {
    if (!cameraRef.current || !permission?.granted) {
      await requestPermission();
      return null;
    }

    try {
      const fotoTirada = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      const nomeArquivo = `foto_${uuidv4()}.jpg`;
      const caminhoLocal = `${FileSystem.documentDirectory}vistorias/${nomeArquivo}`;

      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory}vistorias`,
        { intermediates: true }
      );

      // Move the file if it's not already in the right place
      if (fotoTirada.uri !== caminhoLocal) {
        await FileSystem.copyAsync({
          from: fotoTirada.uri,
          to: caminhoLocal,
        });
      }

      return {
        uri: caminhoLocal,
        tipo: 'foto' as const,
        largura: fotoTirada.width,
        altura: fotoTirada.height,
      };
    } catch (erro) {
      console.error('Erro ao capturar foto:', erro);
      return null;
    }
  };

  const iniciarVideo = async () => {
    if (!cameraRef.current || !permission?.granted) {
      await requestPermission();
      return;
    }

    try {
      setRecording(true);
      // Video recording implementation
    } catch (erro) {
      console.error('Erro ao iniciar gravação:', erro);
      setRecording(false);
    }
  };

  const pararVideo = async () => {
    if (!cameraRef.current) return null;

    try {
      setRecording(false);
      // Video stop implementation
      return null;
    } catch (erro) {
      console.error('Erro ao parar gravação:', erro);
      return null;
    }
  };

  const selecionarFotoDaGaleria = async () => {
    try {
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!resultado.canceled && resultado.assets[0]) {
        const ativo = resultado.assets[0];
        const nomeArquivo = `foto_${uuidv4()}.jpg`;
        const caminhoLocal = `${FileSystem.documentDirectory}vistorias/${nomeArquivo}`;

        await FileSystem.makeDirectoryAsync(
          `${FileSystem.documentDirectory}vistorias`,
          { intermediates: true }
        );

        await FileSystem.copyAsync({
          from: ativo.uri,
          to: caminhoLocal,
        });

        return {
          uri: caminhoLocal,
          tipo: 'foto' as const,
          largura: ativo.width || 1280,
          altura: ativo.height || 720,
        };
      }
    } catch (erro) {
      console.error('Erro ao selecionar foto:', erro);
    }

    return null;
  };

  return {
    cameraRef,
    permission,
    requestPermission,
    recording,
    capturaFoto,
    iniciarVideo,
    pararVideo,
    selecionarFotoDaGaleria,
  };
}
