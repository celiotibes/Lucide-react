import React, { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { AlertCircle, TrendingDown } from 'lucide-react';
import './BudgetTracker.css';

export interface BudgetItem {
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
  color?: string;
}

interface BudgetTrackerProps {
  budgets: BudgetItem[];
  title?: string;
  showPercentage?: boolean;
}

const defaultColors = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899'
];

export const BudgetTracker: React.FC<BudgetTrackerProps> = ({
  budgets,
  title = 'Orçamento',
  showPercentage = true
}) => {
  const { effectiveTheme } = useTheme();

  const stats = useMemo(() => {
    const totalBudgeted = budgets.reduce((sum, b) => sum + b.budgeted, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const totalRemaining = totalBudgeted - totalSpent;
    const percentageSpent = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
    const isOverBudget = totalSpent > totalBudgeted;

    return {
      totalBudgeted,
      totalSpent,
      totalRemaining,
      percentageSpent,
      isOverBudget
    };
  }, [budgets]);

  const getProgressColor = (percentage: number) => {
    if (percentage <= 50) return '#10b981';
    if (percentage <= 80) return '#f59e0b';
    return '#ef4444';
  };

  const budgetsWithColors = useMemo(() => {
    return budgets.map((budget, index) => ({
      ...budget,
      color: budget.color || defaultColors[index % defaultColors.length]
    }));
  }, [budgets]);

  return (
    <div className={`budget-tracker budget-tracker--${effectiveTheme}`}>
      <h2 className="budget-tracker__title">{title}</h2>

      <div className="budget-tracker__summary">
        <div className="budget-tracker__summary-item">
          <span className="budget-tracker__summary-label">Orçado</span>
          <span className="budget-tracker__summary-value">
            {stats.totalBudgeted.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            })}
          </span>
        </div>

        <div className="budget-tracker__summary-item">
          <span className="budget-tracker__summary-label">Gasto</span>
          <span className={`budget-tracker__summary-value ${stats.isOverBudget ? 'over-budget' : ''}`}>
            {stats.totalSpent.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            })}
          </span>
        </div>

        <div className="budget-tracker__summary-item">
          <span className="budget-tracker__summary-label">Restante</span>
          <span className={`budget-tracker__summary-value ${stats.totalRemaining < 0 ? 'negative' : ''}`}>
            {stats.totalRemaining.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            })}
          </span>
        </div>
      </div>

      <div className="budget-tracker__overview">
        <div className="budget-tracker__progress-container">
          <div className="budget-tracker__progress-bar">
            <div
              className="budget-tracker__progress-fill"
              style={{
                width: `${Math.min(stats.percentageSpent, 100)}%`,
                backgroundColor: getProgressColor(stats.percentageSpent)
              }}
            />
          </div>
          <div className="budget-tracker__progress-text">
            <span>{stats.percentageSpent.toFixed(1)}% do orçamento utilizado</span>
            {stats.isOverBudget && (
              <span className="budget-tracker__over-budget-warning">
                <AlertCircle size={14} />
                Excesso: {Math.abs(stats.totalRemaining).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="budget-tracker__categories">
        {budgetsWithColors.map((budget) => {
          const percentage = budget.budgeted > 0 ? (budget.spent / budget.budgeted) * 100 : 0;
          const isOver = budget.spent > budget.budgeted;

          return (
            <div key={budget.category} className="budget-tracker__category">
              <div className="budget-tracker__category-header">
                <div className="budget-tracker__category-info">
                  <span
                    className="budget-tracker__category-color"
                    style={{ backgroundColor: budget.color }}
                  />
                  <span className="budget-tracker__category-name">{budget.category}</span>
                </div>
                <span className={`budget-tracker__category-percentage ${isOver ? 'over' : ''}`}>
                  {percentage.toFixed(0)}%
                </span>
              </div>

              <div className="budget-tracker__category-bar">
                <div
                  className="budget-tracker__category-fill"
                  style={{
                    width: `${Math.min(percentage, 100)}%`,
                    backgroundColor: budget.color
                  }}
                />
              </div>

              <div className="budget-tracker__category-values">
                <span className="budget-tracker__category-spent">
                  Gasto: {budget.spent.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  })}
                </span>
                <span className="budget-tracker__category-budgeted">
                  / {budget.budgeted.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  })}
                </span>
              </div>

              {isOver && (
                <div className="budget-tracker__category-warning">
                  <TrendingDown size={14} />
                  Excesso de {Math.abs(budget.remaining).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
