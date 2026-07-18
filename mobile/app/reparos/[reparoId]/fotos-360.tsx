import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';

interface Foto360 {
  id: string;
  url_foto: string;
  comodo: string;
  data_captura: string;
}

const COMODOS_OPCOES = [
  'Sala',
  'Quarto 1',
  'Quarto 2',
  'Cozinha',
  'Banheiro 1',
  'Banheiro 2',
  'Área de Serviço',
  'Varanda',
  'Garagem',
  'Outro',
];

export default function TelaFotos360() {
  const { reparoId } = useLocalSearchParams<{ reparoId: string }>();
  const router = useRouter();

  const [fotos360, setFotos360] = useState<Foto360[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [capturando, setCapturando] = useState(false);
  const [comodoSelecionado, setComodoSelecionado] = useState('');
  const [frames, setFrames] = useState<string[]>([]);
  const [instrucoes, setInstrucoes] = useState(true);

  useEffect(() => {
    buscarFotos360();
  }, [reparoId]);

  const buscarFotos360 = async () => {
    try {
      const res = await fetch(`/api/reparos/${reparoId}/fotos-360`, {
        method: 'GET',
      });

      const data = await res.json();

      if (res.ok) {
        setFotos360(data.fotos || []);
      } else {
        Alert.alert('Erro', 'Não foi possível carregar as fotos 360');
      }
    } catch (erro) {
      console.error('Erro ao buscar fotos:', erro);
    } finally {
      setCarregando(false);
    }
  };

  const capturarFrame = async () => {
    try {
      const resultado = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        aspect: [16, 9],
      });

      if (!resultado.canceled && resultado.assets.length > 0) {
        setFrames([...frames, resultado.assets[0].uri]);
      }
    } catch (erro) {
      Alert.alert('Erro', 'Não foi possível capturar a imagem');
    }
  };

  const processarPanorama = async () => {
    if (frames.length < 3) {
      Alert.alert('Aviso', 'Capture pelo menos 3 imagens para criar um panorama');
      return;
    }

    if (!comodoSelecionado) {
      Alert.alert('Aviso', 'Selecione o cômodo para o panorama');
      return;
    }

    setCapturando(true);

    try {
      const res = await fetch(`/api/reparos/${reparoId}/fotos-360`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: frames.map((uri) => ({ uri })),
          comodo: comodoSelecionado,
          angulo_horizontal: 360,
          angulo_vertical: 180,
        }),
      });

      if (!res.ok) {
        throw new Error('Erro ao processar panorama');
      }

      Alert.alert('Sucesso', 'Panorama criado com sucesso!');
      setFrames([]);
      setComodoSelecionado('');
      await buscarFotos360();
    } catch (erro) {
      Alert.alert('Erro', 'Erro ao processar panorama');
    } finally {
      setCapturando(false);
    }
  };

  if (carregando) {
    return (
      <View style={styles.containerCarregando}>
        <ActivityIndicator size="large" color="#2196f3" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <LinearGradient colors={['#2196f3', '#1976d2']} style={styles.header}>
        <Text style={styles.titulo}>Fotos 360°</Text>
        <Text style={styles.subtitulo}>Capture panoramas dos cômodos</Text>
      </LinearGradient>

      {instrucoes && (
        <View style={styles.cardInstrucoes}>
          <Text style={styles.tituloInstrucoes}>Como Funciona:</Text>
          <Text style={styles.textoInstrucoes}>
            1. Selecione o cômodo{'\n'}
            2. Aponte a câmera em diferentes ângulos{'\n'}
            3. Capture 3+ imagens{'\n'}
            4. Toque em "Processar Panorama"
          </Text>
          <TouchableOpacity onPress={() => setInstrucoes(false)}>
            <Text style={styles.linkFechar}>← Fechar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Seleção de Cômodo */}
      <View style={styles.secao}>
        <Text style={styles.tituloSecao}>Selecionar Cômodo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollComodos}>
          {COMODOS_OPCOES.map((comodo) => (
            <TouchableOpacity
              key={comodo}
              style={[
                styles.botaoComodo,
                comodoSelecionado === comodo && styles.botaoComodoSelecionado,
              ]}
              onPress={() => setComodoSelecionado(comodo)}
            >
              <Text
                style={[
                  styles.textoComodo,
                  comodoSelecionado === comodo && styles.textoComodoSelecionado,
                ]}
              >
                {comodo}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Captura de Frames */}
      {comodoSelecionado && (
        <View style={styles.secao}>
          <Text style={styles.tituloSecao}>Capturar Frames</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Frames Capturados: {frames.length}</Text>

            <TouchableOpacity
              style={styles.botaoCaptura}
              onPress={capturarFrame}
              disabled={capturando}
            >
              <Text style={styles.textoCaptura}>
                {capturando ? '⏳ Processando...' : '📷 Capturar Frame'}
              </Text>
            </TouchableOpacity>

            {frames.length > 0 && (
              <View>
                <Text style={styles.label} >Frames para panorama: {frames.length}</Text>

                <TouchableOpacity
                  style={[styles.botaoProcessar, capturando && styles.botaoDesabilitado]}
                  onPress={processarPanorama}
                  disabled={capturando}
                >
                  <Text style={styles.textoProcessar}>
                    {capturando ? 'Processando...' : '✓ Processar Panorama'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.botaoLimpar}
                  onPress={() => setFrames([])}
                >
                  <Text style={styles.textoLimpar}>🗑️ Limpar Frames</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Panoramas Salvos */}
      {fotos360.length > 0 && (
        <View style={styles.secao}>
          <Text style={styles.tituloSecao}>Panoramas Salvos ({fotos360.length})</Text>

          {fotos360.map((foto) => (
            <View key={foto.id} style={styles.cardPanorama}>
              <Text style={styles.nomePanorama}>{foto.comodo}</Text>
              <Text style={styles.dataCaptura}>
                {new Date(foto.data_captura).toLocaleDateString('pt-BR')}
              </Text>
              <TouchableOpacity style={styles.botaoVisualizar}>
                <Text style={styles.textoVisualizar}>👁️ Visualizar Panorama</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Botão Voltar */}
      <View style={styles.secao}>
        <TouchableOpacity style={styles.botaoVoltar} onPress={() => router.back()}>
          <Text style={styles.textoVoltar}>← Voltar</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerCarregando: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  subtitulo: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
  },
  cardInstrucoes: {
    margin: 16,
    padding: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  tituloInstrucoes: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 8,
  },
  textoInstrucoes: {
    fontSize: 12,
    color: '#1565c0',
    lineHeight: 18,
    marginBottom: 12,
  },
  linkFechar: {
    fontSize: 12,
    color: '#2196f3',
    fontWeight: '600',
  },
  secao: {
    padding: 16,
  },
  tituloSecao: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  scrollComodos: {
    marginBottom: 12,
  },
  botaoComodo: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  botaoComodoSelecionado: {
    backgroundColor: '#2196f3',
    borderColor: '#1976d2',
  },
  textoComodo: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  textoComodoSelecionado: {
    color: '#fff',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  botaoCaptura: {
    backgroundColor: '#4caf50',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  textoCaptura: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  botaoProcessar: {
    backgroundColor: '#2196f3',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  textoProcessar: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  botaoLimpar: {
    backgroundColor: '#f44336',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  textoLimpar: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  botaoDesabilitado: {
    backgroundColor: '#ccc',
  },
  cardPanorama: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  nomePanorama: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  dataCaptura: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  botaoVisualizar: {
    backgroundColor: '#9c27b0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  textoVisualizar: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  botaoVoltar: {
    backgroundColor: '#f0f0f0',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  textoVoltar: {
    color: '#333',
    fontWeight: '600',
    fontSize: 16,
  },
});
