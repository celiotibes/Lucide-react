import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionForm, TransactionData } from '../TransactionForm';
import { ThemeProvider } from '../../context/ThemeContext';

describe('TransactionForm', () => {
  const mockOnSubmit = vi.fn();

  const renderComponent = (props = {}) => {
    return render(
      <ThemeProvider>
        <TransactionForm onSubmit={mockOnSubmit} {...props} />
      </ThemeProvider>
    );
  };

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('renders form fields', () => {
    renderComponent();

    expect(screen.getByText(/Descrição/i)).toBeInTheDocument();
    expect(screen.getByText(/Valor/i)).toBeInTheDocument();
    expect(screen.getByText(/Data/i)).toBeInTheDocument();
    expect(screen.getByText(/Categoria/i)).toBeInTheDocument();
  });

  it('handles form submission with valid data', async () => {
    const user = userEvent.setup();
    renderComponent();

    const descriptionInput = screen.getByPlaceholderText(/Ex: Aluguel do imóvel/i) as HTMLInputElement;
    const amountInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    const submitButton = screen.getByRole('button', { name: /Criar Transação/i });

    await user.type(descriptionInput, 'Test Transaction');
    await user.type(amountInput, '100.00');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test Transaction',
          amount: 100,
          type: 'expense'
        })
      );
    });
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    renderComponent();

    const submitButton = screen.getByRole('button', { name: /Criar Transação/i });
    await user.click(submitButton);

    expect(screen.getByText(/Descrição é obrigatória/i)).toBeInTheDocument();
  });

  it('toggles between income and expense', async () => {
    const user = userEvent.setup();
    renderComponent();

    const incomeButton = screen.getByRole('button', { name: /Receita/i });
    await user.click(incomeButton);

    const descriptionInput = screen.getByPlaceholderText(/Ex: Aluguel do imóvel/i);
    const amountInput = screen.getByPlaceholderText('0.00');

    await user.type(descriptionInput, 'Test Income');
    await user.type(amountInput, '500.00');

    const submitButton = screen.getByRole('button', { name: /Criar Transação/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income'
        })
      );
    });
  });

  it('handles tag addition and removal', async () => {
    const user = userEvent.setup();
    renderComponent();

    const tagInput = screen.getByPlaceholderText(/Adicione uma tag/i);
    const addButton = screen.getByRole('button', { name: /Adicionar/i });

    await user.type(tagInput, 'urgent');
    await user.click(addButton);

    expect(screen.getByText('urgent')).toBeInTheDocument();

    const removeButton = screen.getByRole('button', { name: /×/i });
    await user.click(removeButton);

    expect(screen.queryByText('urgent')).not.toBeInTheDocument();
  });

  it('displays initial data when provided', () => {
    const initialData: TransactionData = {
      id: '1',
      description: 'Existing Transaction',
      amount: 250,
      category: 'Aluguel',
      date: '2024-01-01',
      type: 'expense',
      tags: ['important'],
      notes: 'Test notes'
    };

    renderComponent({ initialData });

    expect(screen.getByDisplayValue('Existing Transaction')).toBeInTheDocument();
    expect(screen.getByDisplayValue('250')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test notes')).toBeInTheDocument();
  });

  it('disables submit button while loading', () => {
    renderComponent({ isLoading: true });

    const submitButton = screen.getByRole('button', { name: /Enviando/i });
    expect(submitButton).toBeDisabled();
  });
});
