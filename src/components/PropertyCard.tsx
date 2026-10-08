import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { MapPin, Building2, DollarSign, TrendingUp } from 'lucide-react';
import './PropertyCard.css';

export interface PropertyData {
  id: string;
  name: string;
  address: string;
  value: number;
  monthlyRent?: number;
  occupancyRate?: number;
  type: 'residential' | 'commercial' | 'industrial' | 'mixed';
  imageUrl?: string;
  status: 'active' | 'inactive' | 'rented' | 'sale';
}

interface PropertyCardProps {
  property: PropertyData;
  onClick?: (property: PropertyData) => void;
  isSelected?: boolean;
  showDetails?: boolean;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return '#10b981';
    case 'rented':
      return '#3b82f6';
    case 'sale':
      return '#f59e0b';
    default:
      return '#6b7280';
  }
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    active: 'Ativo',
    inactive: 'Inativo',
    rented: 'Alugado',
    sale: 'À Venda'
  };
  return labels[status] || status;
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'residential':
      return '🏡';
    case 'commercial':
      return '🏢';
    case 'industrial':
      return '🏭';
    case 'mixed':
      return '🏗️';
    default:
      return '🏠';
  }
};

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  onClick,
  isSelected = false,
  showDetails = true
}) => {
  const { effectiveTheme } = useTheme();

  const handleClick = () => {
    if (onClick) {
      onClick(property);
    }
  };

  return (
    <div
      className={`property-card property-card--${effectiveTheme} ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      {property.imageUrl && (
        <div className="property-card__image">
          <img src={property.imageUrl} alt={property.name} />
          <span className="property-card__type-icon">{getTypeIcon(property.type)}</span>
        </div>
      )}

      <div className="property-card__content">
        <div className="property-card__header">
          <h3 className="property-card__title">{property.name}</h3>
          <span
            className="property-card__status"
            style={{ backgroundColor: getStatusColor(property.status) }}
          >
            {getStatusLabel(property.status)}
          </span>
        </div>

        <div className="property-card__location">
          <MapPin size={16} />
          <p>{property.address}</p>
        </div>

        {showDetails && (
          <div className="property-card__details">
            <div className="property-card__detail">
              <span className="property-card__detail-label">
                <DollarSign size={16} />
                Valor
              </span>
              <span className="property-card__detail-value">
                {property.value.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                })}
              </span>
            </div>

            {property.monthlyRent && (
              <div className="property-card__detail">
                <span className="property-card__detail-label">
                  <Building2 size={16} />
                  Aluguel
                </span>
                <span className="property-card__detail-value">
                  {property.monthlyRent.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  })}
                </span>
              </div>
            )}

            {property.occupancyRate !== undefined && (
              <div className="property-card__detail">
                <span className="property-card__detail-label">
                  <TrendingUp size={16} />
                  Taxa Ocupação
                </span>
                <span className="property-card__detail-value">
                  {property.occupancyRate}%
                </span>
              </div>
            )}
          </div>
        )}

        {property.monthlyRent && property.value > 0 && (
          <div className="property-card__roi">
            <p className="property-card__roi-label">ROI Anual Estimado</p>
            <p className="property-card__roi-value">
              {((property.monthlyRent * 12 / property.value) * 100).toFixed(2)}%
            </p>
          </div>
        )}
      </div>

      {isSelected && (
        <div className="property-card__checkmark">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      )}
    </div>
  );
};
