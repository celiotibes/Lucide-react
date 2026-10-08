import React, { useState, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import './TransactionForm.css';

export interface TransactionData {
  id?: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  type: 'income' | 'expense';
  propertyId?: string;
  tags: string[];
  notes?: string;
}

interface TransactionFormProps {
  onSubmit: (transaction: TransactionData) => Promise<void>;
  initialData?: TransactionData;
  isLoading?: boolean;
  categories?: string[];
}

const defaultCategories = [
  'Aluguel',
  'Condomínio',
  'IPTU',
  'Reparos',
  'Manutenção',
  'Utilidades',
  'Seguros',
  'Outro'
];

export const TransactionForm: React.FC<TransactionFormProps> = ({
  onSubmit,
  initialData,
  isLoading = false,
  categories = defaultCategories
}) => {
  const { effectiveTheme } = useTheme();
  const [formData, setFormData] = useState<TransactionData>(
    initialData || {
      description: '',
      amount: 0,
      category: categories[0],
      date: new Date().toISOString().split('T')[0],
      type: 'expense',
      tags: [],
      notes: ''
    }
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tagInput, setTagInput] = useState('');

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!formData.description.trim()) {
      newErrors.description = 'Descrição é obrigatória';
    }

    if (formData.amount <= 0) {
      newErrors.amount = 'Valor deve ser maior que 0';
    }

    if (!formData.date) {
      newErrors.date = 'Data é obrigatória';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(formData);
      // Reset form on success
      if (!initialData) {
        setFormData({
          description: '',
          amount: 0,
          category: categories[0],
          date: new Date().toISOString().split('T')[0],
          type: 'expense',
          tags: [],
          notes: ''
        });
      }
    } catch (error) {
      console.error('Error submitting transaction:', error);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()]
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(t => t !== tag)
    });
  };

  return (
    <form
      className={`transaction-form transaction-form--${effectiveTheme}`}
      onSubmit={handleSubmit}
    >
      <div className="transaction-form__group">
        <label htmlFor="type" className="transaction-form__label">
          Tipo
        </label>
        <div className="transaction-form__type-selector">
          <button
            type="button"
            className={`transaction-form__type-btn ${formData.type === 'expense' ? 'active' : ''}`}
            onClick={() => setFormData({ ...formData, type: 'expense' })}
          >
            Despesa
          </button>
          <button
            type="button"
            className={`transaction-form__type-btn ${formData.type === 'income' ? 'active' : ''}`}
            onClick={() => setFormData({ ...formData, type: 'income' })}
          >
            Receita
          </button>
        </div>
      </div>

      <div className="transaction-form__group">
        <label htmlFor="description" className="transaction-form__label">
          Descrição *
        </label>
        <input
          id="description"
          type="text"
          className={`transaction-form__input ${errors.description ? 'error' : ''}`}
          value={formData.description}
          onChange={(e) => {
            setFormData({ ...formData, description: e.target.value });
            if (errors.description) {
              setErrors({ ...errors, description: '' });
            }
          }}
          placeholder="Ex: Aluguel do imóvel"
        />
        {errors.description && <span className="transaction-form__error">{errors.description}</span>}
      </div>

      <div className="transaction-form__group">
        <label htmlFor="amount" className="transaction-form__label">
          Valor (R$) *
        </label>
        <input
          id="amount"
          type="number"
          step="0.01"
          min="0"
          className={`transaction-form__input ${errors.amount ? 'error' : ''}`}
          value={formData.amount}
          onChange={(e) => {
            setFormData({ ...formData, amount: parseFloat(e.target.value) });
            if (errors.amount) {
              setErrors({ ...errors, amount: '' });
            }
          }}
          placeholder="0.00"
        />
        {errors.amount && <span className="transaction-form__error">{errors.amount}</span>}
      </div>

      <div className="transaction-form__row">
        <div className="transaction-form__group">
          <label htmlFor="date" className="transaction-form__label">
            Data *
          </label>
          <input
            id="date"
            type="date"
            className={`transaction-form__input ${errors.date ? 'error' : ''}`}
            value={formData.date}
            onChange={(e) => {
              setFormData({ ...formData, date: e.target.value });
              if (errors.date) {
                setErrors({ ...errors, date: '' });
              }
            }}
          />
          {errors.date && <span className="transaction-form__error">{errors.date}</span>}
        </div>

        <div className="transaction-form__group">
          <label htmlFor="category" className="transaction-form__label">
            Categoria
          </label>
          <select
            id="category"
            className="transaction-form__select"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="transaction-form__group">
        <label htmlFor="notes" className="transaction-form__label">
          Notas
        </label>
        <textarea
          id="notes"
          className="transaction-form__textarea"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Detalhes adicionais..."
          rows={3}
        />
      </div>

      <div className="transaction-form__group">
        <label className="transaction-form__label">Tags</label>
        <div className="transaction-form__tag-input">
          <input
            type="text"
            className="transaction-form__input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
            placeholder="Adicione uma tag e pressione Enter"
          />
          <button
            type="button"
            className="transaction-form__tag-btn"
            onClick={handleAddTag}
          >
            Adicionar
          </button>
        </div>
        <div className="transaction-form__tags">
          {formData.tags.map(tag => (
            <span key={tag} className="transaction-form__tag">
              {tag}
              <button
                type="button"
                className="transaction-form__tag-remove"
                onClick={() => handleRemoveTag(tag)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="transaction-form__submit"
        disabled={isLoading}
      >
        {isLoading ? 'Enviando...' : initialData ? 'Atualizar' : 'Criar Transação'}
      </button>
    </form>
  );
};
