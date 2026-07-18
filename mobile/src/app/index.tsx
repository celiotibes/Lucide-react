import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { obterVistorias } from '@/lib/repos/vistoriaRepo';
import type { Vistoria } from '@/lib/repos/vistoriaRepo';
import { formatarData } from '@/lib/formatacao';

export default function HomeScreen() {
  const router = useRouter();
  const [vistorias, setVistorias] = useState<Vistoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    carregarVistorias();
  }, []);

  const carregarVistorias = async () => {
    try {
      const dados = await obterVistorias();
      setVistorias(dados);
    } catch (erro) {
      console.error('Erro ao carregar vistorias:', erro);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    carregarVistorias();
  };

  const handleVistoria = (id: string) => {
    router.push(`/(tabs)/vistorias/${id}`);
  };

  const renderItem = ({ item }: { item: Vistoria }) => {
    const tipoLabel = {
      entrada: 'Entrada',
      periodica: 'Periódica',
      saida: 'Saída',
      conferencia: 'Conferência',
    }[item.tipo];

    const statusColor =
      item.status === 'concluida' || item.status === 'assinada'
        ? '#4CAF50'
        : item.status === 'em_andamento'
          ? '#2196F3'
          : '#FFC107';

    return (
      <TouchableOpacity
        style={styles.vistoriaCard}
        onPress={() => handleVistoria(item.id)}
      >
        <View style={styles.vistoriaHeader}>
          <View>
            <Text style={styles.vistoriaTipo}>{tipoLabel}</Text>
            <Text style={styles.vistoriaImovel}>{item.imovel_id}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.vistoriaData}>{formatarData(item.data)}</Text>
      </TouchableOpacity>
    );
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

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={vistorias}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.centerContent}>
            <Text style={styles.emptyText}>Nenhuma vistoria agendada</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
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
  listContent: {
    padding: 12,
    gap: 12,
  },
  vistoriaCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  vistoriaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  vistoriaTipo: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066cc',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  vistoriaImovel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  vistoriaData: {
    fontSize: 13,
    color: '#999',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
