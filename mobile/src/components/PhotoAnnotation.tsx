import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, Text, ScrollView, TextInput, Modal, Dimensions } from 'react-native';
import { Svg, Circle, Line, Rect, Text as SvgText, Polyline, G } from 'react-native-svg';
import { usePhotoAnnotations, DrawingElement } from '../lib/hooks/usePhotoAnnotations';

interface PhotoAnnotationProps {
  imageUri: string;
  onSave: (annotations: string) => void;
  onCancel: () => void;
  initialAnnotations?: string;
}

const COLORS = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#000000', '#FFFFFF'];
const STROKE_WIDTHS = [1, 2, 3, 4, 5];

export default function PhotoAnnotation({
  imageUri,
  onSave,
  onCancel,
  initialAnnotations,
}: PhotoAnnotationProps) {
  const svgRef = useRef<any>(null);
  const [textInputVisible, setTextInputVisible] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 });

  const annotations = usePhotoAnnotations(initialAnnotations);

  const handleSvgPress = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    const point = { x: locationX, y: locationY };

    if (annotations.currentTool === 'text') {
      setTextPosition(point);
      setTextInputVisible(true);
      setTextValue('');
    } else {
      annotations.handleStartDrawing(point);
    }
  };

  const handleSvgMove = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    annotations.handleDrawing({ x: locationX, y: locationY });
  };

  const handleSvgEnd = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    annotations.handleEndDrawing({ x: locationX, y: locationY });
  };

  const handleAddText = () => {
    if (textValue.trim()) {
      annotations.handleAddText(textPosition, textValue);
      setTextInputVisible(false);
      setTextValue('');
    }
  };

  const renderElement = (element: DrawingElement) => {
    const key = element.id;

    switch (element.type) {
      case 'arrow':
        if (!element.points || element.points.length < 2) return null;
        const pathData = element.points.reduce((acc, point, i) => {
          return acc + (i === 0 ? `M${point.x},${point.y}` : `L${point.x},${point.y}`);
        }, '');
        return (
          <Polyline
            key={key}
            points={element.points.map((p) => `${p.x},${p.y}`).join(' ')}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            fill="none"
          />
        );

      case 'circle':
        if (!element.startPoint || !element.radius) return null;
        return (
          <Circle
            key={key}
            cx={element.startPoint.x}
            cy={element.startPoint.y}
            r={element.radius}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            fill="none"
          />
        );

      case 'rectangle':
        if (!element.startPoint || !element.endPoint) return null;
        const x = Math.min(element.startPoint.x, element.endPoint.x);
        const y = Math.min(element.startPoint.y, element.endPoint.y);
        const width = Math.abs(element.endPoint.x - element.startPoint.x);
        const height = Math.abs(element.endPoint.y - element.startPoint.y);
        return (
          <Rect
            key={key}
            x={x}
            y={y}
            width={width}
            height={height}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            fill="none"
          />
        );

      case 'text':
        if (!element.startPoint || !element.text) return null;
        return (
          <SvgText
            key={key}
            x={element.startPoint.x}
            y={element.startPoint.y}
            fill={element.color}
            fontSize={14}
            fontWeight="bold"
          >
            {element.text}
          </SvgText>
        );

      default:
        return null;
    }
  };

  const screenHeight = Dimensions.get('window').height;
  const svgHeight = screenHeight * 0.6;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Image and Annotation Canvas */}
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Svg
          ref={svgRef}
          width="100%"
          height={svgHeight}
          onPress={handleSvgPress}
          onPressIn={handleSvgPress}
          onPressMove={handleSvgMove}
          onPressOut={handleSvgEnd}
          style={{ backgroundColor: '#333' }}
        >
          {/* Placeholder for image - in real implementation would use Image component */}
          <Rect width="100%" height={svgHeight} fill="#333" />

          {/* Draw all elements */}
          {annotations.elements.map((element) => renderElement(element))}
        </Svg>
      </View>

      {/* Tool Selection */}
      <ScrollView
        horizontal
        style={{ backgroundColor: '#1a1a1a', paddingVertical: 10, paddingHorizontal: 10 }}
      >
        {['arrow', 'circle', 'rectangle', 'text'].map((tool) => (
          <TouchableOpacity
            key={tool}
            onPress={() => annotations.setCurrentTool(annotations.currentTool === tool ? null : tool)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              marginRight: 8,
              backgroundColor: annotations.currentTool === tool ? '#0066cc' : '#333',
              borderRadius: 4,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, textTransform: 'capitalize' }}>
              {tool === 'arrow' ? '→' : tool === 'circle' ? '●' : tool === 'rectangle' ? '▭' : 'A'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Color Selection */}
      <View style={{ backgroundColor: '#1a1a1a', paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row' }}>
        <Text style={{ color: '#fff', marginRight: 10, lineHeight: 32 }}>Cor:</Text>
        <ScrollView horizontal>
          {COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              onPress={() => annotations.setColor(color)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: color,
                marginRight: 8,
                borderWidth: annotations.color === color ? 3 : 0,
                borderColor: '#fff',
              }}
            />
          ))}
        </ScrollView>
      </View>

      {/* Stroke Width Selection */}
      <View style={{ backgroundColor: '#1a1a1a', paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row' }}>
        <Text style={{ color: '#fff', marginRight: 10, lineHeight: 32 }}>Espessura:</Text>
        <ScrollView horizontal>
          {STROKE_WIDTHS.map((width) => (
            <TouchableOpacity
              key={width}
              onPress={() => annotations.setStrokeWidth(width)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginRight: 8,
                backgroundColor: annotations.strokeWidth === width ? '#0066cc' : '#333',
                borderRadius: 4,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 12 }}>{width}px</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Action Buttons */}
      <View
        style={{
          backgroundColor: '#1a1a1a',
          paddingVertical: 12,
          paddingHorizontal: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <TouchableOpacity
          onPress={annotations.handleUndo}
          disabled={!annotations.canUndo}
          style={{
            flex: 1,
            paddingVertical: 10,
            backgroundColor: annotations.canUndo ? '#666' : '#333',
            borderRadius: 4,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: annotations.canUndo ? '#fff' : '#999', fontSize: 12 }}>↶ Desfazer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={annotations.handleRedo}
          disabled={!annotations.canRedo}
          style={{
            flex: 1,
            paddingVertical: 10,
            backgroundColor: annotations.canRedo ? '#666' : '#333',
            borderRadius: 4,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: annotations.canRedo ? '#fff' : '#999', fontSize: 12 }}>↷ Refazer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={annotations.handleClear}
          style={{
            flex: 1,
            paddingVertical: 10,
            backgroundColor: '#cc0000',
            borderRadius: 4,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12 }}>✕ Limpar</Text>
        </TouchableOpacity>
      </View>

      {/* Save/Cancel Buttons */}
      <View
        style={{
          backgroundColor: '#1a1a1a',
          paddingVertical: 12,
          paddingHorizontal: 10,
          flexDirection: 'row',
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: '#333',
        }}
      >
        <TouchableOpacity
          onPress={onCancel}
          style={{
            flex: 1,
            paddingVertical: 12,
            backgroundColor: '#333',
            borderRadius: 4,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Cancelar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onSave(annotations.getSerializedAnnotations())}
          style={{
            flex: 1,
            paddingVertical: 12,
            backgroundColor: '#00cc00',
            borderRadius: 4,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#000', fontWeight: '600' }}>Salvar Anotações</Text>
        </TouchableOpacity>
      </View>

      {/* Text Input Modal */}
      <Modal
        visible={textInputVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTextInputVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.7)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 8,
              padding: 20,
              width: '80%',
              maxWidth: 400,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, marginBottom: 12, fontWeight: '600' }}>
              Adicionar texto
            </Text>

            <TextInput
              style={{
                backgroundColor: '#333',
                color: '#fff',
                padding: 10,
                borderRadius: 4,
                marginBottom: 12,
                minHeight: 40,
              }}
              placeholder="Digite o texto..."
              placeholderTextColor="#999"
              value={textValue}
              onChangeText={setTextValue}
              multiline
              autoFocus
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setTextInputVisible(false)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  backgroundColor: '#333',
                  borderRadius: 4,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff' }}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleAddText}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  backgroundColor: '#0066cc',
                  borderRadius: 4,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Adicionar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
