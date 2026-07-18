import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { obterItensVistoria, criarOuAtualizarItemVistoria } from '@/lib/repos/vistoriaRepo';
import { criarMedia, obterMedias } from '@/lib/repos/mediaRepo';
import { useCamera } from '@/lib/hooks/useCamera';
import { useAudio } from '@/lib/hooks/useAudio';
import type { ItemVistoria, Media } from '@/lib/repos/vistoriaRepo';

const ESTADOS = ['novo', 'bom', 'regular', 'danificado', 'inexistente'] as const;

export default function ItemCaptureScreen() {
  const router = useRouter();
  const { id: vistoriaId, ambienteId, itemId } = useLocalSearchParams();
  const [item, setItem] = useState<ItemVistoria | null>(null);
  const [medias, setMedias] = useState<Media[]>([]);
  const [selectedEstado, setSelectedEstado] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [showEstadoModal, setShowEstadoModal] = useState(false);

  const { capturaFoto, selecionarFotoDaGaleria } = useCamera();
  const { recording, iniciarGravacao, pararGravacao } = useAudio();
  const [permission] = useCameraPermissions();

  useEffect(() => {
    carregarDados();
  }, [vistoriaId, itemId]);

  const carregarDados = async () => {
    try {
      if (typeof vistoriaId === 'string' && typeof itemId === 'string') {
        const itens = await obterItensVistoria(vistoriaId);
        const itemEncontrado = itens.find((i) => i.id === itemId);

        if (itemEncontrado) {
          setItem(itemEncontrado);
          setSelectedEstado(itemEncontrado.estado);
          setObservacao(itemEncontrado.observacao || '');

          const midasDoItem = await obterMedias(itemId);
          setMedias(midasDoItem);
        }
      }
    } catch (erro) {
      console.error('Erro ao carregar item:', erro);
    } finally {
      setLoading(false);
    }
  };

  const handleCapturaFoto = async () => {
    const foto = await capturaFoto();
    if (foto && item) {
      try {
        const media = await criarMedia(item.id, 'foto', foto.uri, {
          largura: foto.largura,
          altura: foto.altura,
        });
        setMedias([...medias, media]);
        setShowCamera(false);
      } catch (erro) {
        console.error('Erro ao salvar foto:', erro);
      }
    }
  };

  const handleSelecionarFoto = async () => {
    const foto = await selecionarFotoDaGaleria();
    if (foto && item) {
      try {
        const media = await criarMedia(item.id, 'foto', foto.uri, {
          largura: foto.largura,
          altura: foto.altura,
        });
        setMedias([...medias, media]);
      } catch (erro) {
        console.error('Erro ao selecionar foto:', erro);
      }
    }
  };

  const handleGravarAudio = async () => {
    if (recording) {
      const resultado = await pararGravacao();
      if (resultado && item) {
        try {
          const media = await criarMedia(item.id, 'audio', resultado.uri, {
            duracao: resultado.duracao,
          });
          setMedias([...medias, media]);
        } catch (erro) {
          console.error('Erro ao salvar áudio:', erro);
        }
      }
    } else {
      await iniciarGravacao();
    }
  };

  const handleSalvarItem = async () => {
    if (!item || typeof vistoriaId !== 'string' || !selectedEstado) return;

    try {
      await criarOuAtualizarItemVistoria(
        vistoriaId,
        item.item_id,
        item.item_checklist_id,
        selectedEstado as any,
        observacao || null
      );
      router.back();
    } catch (erro) {
      console.error('Erro ao salvar item:', erro);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#0066cc" />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Item não encontrado</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.itemName}>{item.item_id}</Text>
          <Text style={styles.itemType}>Inspeção de item</Text>
        </View>

        {/* Estado */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estado do item</Text>
          <TouchableOpacity
            style={styles.estadoButton}
            onPress={() => setShowEstadoModal(true)}
          >
            <Text style={styles.estadoButtonText}>
              {selectedEstado ? selectedEstado.toUpperCase() : 'Selecionar estado'}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <Modal visible={showEstadoModal} transparent animationType="slide">
            <SafeAreaView style={styles.modalContainer}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Selecione o estado</Text>
                <FlatList
                  data={ESTADOS}
                  renderItem={({ item: estado }) => (
                    <TouchableOpacity
                      style={[
                        styles.estadoOption,
                        selectedEstado === estado && styles.estadoOptionSelected,
                      ]}
                      onPress={() => {
                        setSelectedEstado(estado);
                        setShowEstadoModal(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.estadoOptionText,
                          selectedEstado === estado && styles.estadoOptionTextSelected,
                        ]}
                      >
                        {estado.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  )}
                  keyExtractor={(item) => item}
                />
              </View>
            </SafeAreaView>
          </Modal>
        </View>

        {/* Observação */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observação</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Descreva o estado, danos ou observações..."
              value={observacao}
              onChangeText={setObservacao}
              multiline
              numberOfLines={4}
              placeholderTextColor="#999"
            />
          </View>
        </View>

        {/* Mídia */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mídia ({medias.length})</Text>

          <View style={styles.mediaGrid}>
            {medias.map((media) => (
              <View key={media.id} style={styles.mediaItem}>
                <View
                  style={[
                    styles.mediaThumbnail,
                    {
                      backgroundColor:
                        media.tipo === 'foto'
                          ? '#E3F2FD'
                          : media.tipo === 'video'
                            ? '#FFF3E0'
                            : '#F3E5F5',
                    },
                  ]}
                >
                  <Text style={styles.mediaIcon}>
                    {media.tipo === 'foto' ? '📷' : media.tipo === 'video' ? '🎬' : '🎤'}
                  </Text>
                </View>
                <Text style={styles.mediaType}>{media.tipo}</Text>
              </View>
            ))}
          </View>

          <View style={styles.captureButtons}>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={handleCapturaFoto}
            >
              <Text style={styles.captureButtonText}>📷 Câmera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.captureButton}
              onPress={handleSelecionarFoto}
            >
              <Text style={styles.captureButtonText}>🖼️ Galeria</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.captureButton, recording && styles.recordingButton]}
              onPress={handleGravarAudio}
            >
              <Text style={styles.captureButtonText}>
                {recording ? '⏹️ Parar' : '🎤 Áudio'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSalvarItem}
          >
            <Text style={styles.saveButtonText}>Salvar e voltar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Camera Modal */}
      <Modal visible={showCamera} animationType="slide">
        <SafeAreaView style={styles.cameraContainer}>
          {permission?.granted ? (
            <CameraView style={styles.camera}>
              <View style={styles.cameraOverlay}>
                <TouchableOpacity
                  style={styles.closeCameraButton}
                  onPress={() => setShowCamera(false)}
                >
                  <Text style={styles.closeCameraButtonText}>✕</Text>
                </TouchableOpacity>

                <View style={styles.cameraControls}>
                  <TouchableOpacity
                    style={styles.capturePhotoButton}
                    onPress={handleCapturaFoto}
                  >
                    <View style={styles.capturePhotoInner} />
                  </TouchableOpacity>
                </View>
              </View>
            </CameraView>
          ) : (
            <View style={styles.centerContent}>
              <Text>Permissão de câmera necessária</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// Import TextInput from react-native (was missing)
import { TextInput } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 24,
  },
  itemName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  itemType: {
    fontSize: 13,
    color: '#999',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  estadoButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  estadoButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#0066cc',
  },
  chevron: {
    fontSize: 20,
    color: '#ddd',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  estadoOption: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  estadoOptionSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#0066cc',
  },
  estadoOptionText: {
    fontSize: 16,
    color: '#333',
  },
  estadoOptionTextSelected: {
    color: '#0066cc',
    fontWeight: '600',
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textInput: {
    padding: 12,
    fontSize: 14,
    color: '#333',
    textAlignVertical: 'top',
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  mediaItem: {
    alignItems: 'center',
  },
  mediaThumbnail: {
    width: 70,
    height: 70,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaIcon: {
    fontSize: 32,
  },
  mediaType: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  captureButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  captureButton: {
    flex: 1,
    backgroundColor: '#0066cc',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  recordingButton: {
    backgroundColor: '#FF5252',
  },
  captureButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#999',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 40,
  },
  closeCameraButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeCameraButtonText: {
    color: '#fff',
    fontSize: 24,
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  capturePhotoButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  capturePhotoInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  errorText: {
    fontSize: 16,
    color: '#FF5252',
  },
});
