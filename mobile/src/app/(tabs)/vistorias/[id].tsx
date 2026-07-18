import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { obterVistoria } from '@/lib/repos/vistoriaRepo';
import { obterAmbientes } from '@/lib/repos/vistoriaRepo';
import type { Vistoria, Ambiente } from '@/lib/repos/vistoriaRepo';

export default function VistoriaDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [vistoria, setVistoria] = useState<Vistoria | null>(null);
  const [ambientes, setAmbientes] = useState<Ambiente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [id]);

  const carregarDados = async () => {
    try {
      if (typeof id === 'string') {
        const v = await obterVistoria(id);
        setVistoria(v);

        if (v) {
          const a = await obterAmbientes(v.id);
          setAmbientes(a);
        }
      }
    } catch (erro) {
      console.error('Erro ao carregar vistoria:', erro);
    } finally {
      setLoading(false);
    }
  };

  const handleAmbiente = (ambienteId: string) => {
    router.push({
      pathname: `/(tabs)/vistorias/${id}/ambiente/[ambienteId]`,
      params: { ambienteId },
    });
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

  if (!vistoria) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Vistoria não encontrada</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: Ambiente }) => (
    <TouchableOpacity
      style={styles.ambienteCard}
      onPress={() => handleAmbiente(item.id)}
    >
      <Text style={styles.ambienteName}>{item.nome}</Text>
      <View style={styles.ambienteFooter}>
        <Text style={styles.ambienteOrder}>Cômodo {item.ordem}</Text>
        <Text style={styles.ambienteChevron}>›</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.tipoLabel}>
            {vistoria.tipo === 'entrada'
              ? 'Entrada'
              : vistoria.tipo === 'saida'
                ? 'Saída'
                : 'Periódica'}
          </Text>
          <Text style={styles.vistoriaTitle}>{vistoria.imovel_id}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{vistoria.status}</Text>
        </View>
      </View>

      <FlatList
        data={ambientes}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        scrollEnabled={false}
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <Text style={styles.emptyText}>
              Nenhum cômodo configurado
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
  tipoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066cc',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  vistoriaTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#0066cc',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: 12,
    gap: 12,
  },
  ambienteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  ambienteName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  ambienteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ambienteOrder: {
    fontSize: 12,
    color: '#999',
  },
  ambienteChevron: {
    fontSize: 24,
    color: '#ddd',
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  errorText: {
    fontSize: 16,
    color: '#FF5252',
  },
});
