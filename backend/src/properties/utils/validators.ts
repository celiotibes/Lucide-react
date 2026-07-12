import { ValidationError } from '../middleware/error.middleware';

export class PropertyValidators {
  static validateInternalCode(code: string): boolean {
    const pattern = /^[A-Z]{2,4}-\d{2,3}-\d{3}$/;
    return pattern.test(code);
  }

  static validateEmail(email: string): boolean {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
  }

  static validatePhone(phone: string): boolean {
    const pattern = /^[\d\s\-\(\)]+$/;
    return pattern.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  static validateArea(area: number): boolean {
    return area > 0 && area < 1000;
  }

  static validatePrice(price: number): boolean {
    return price > 0 && price < 1000000;
  }

  static validateOccupancy(occupancy: number): boolean {
    return occupancy >= 0 && occupancy <= 1;
  }

  static validatePropertyType(type: string): boolean {
    return ['kitnet', 'apt_2qt', 'apt_3qt'].includes(type);
  }

  static validatePropertyStatus(status: string): boolean {
    return ['active', 'maintenance', 'off_season', 'archived'].includes(status);
  }

  static validatePlatform(platform: string): boolean {
    return ['airbnb', 'booking', 'vrbo', 'direct'].includes(platform);
  }

  static validateSyncStatus(status: string): boolean {
    return ['synced', 'pending', 'error'].includes(status);
  }

  static validateLeadStage(stage: string): boolean {
    return [
      'inquiry',
      'contacted',
      'tour_scheduled',
      'touring',
      'negotiation',
      'closed',
      'lost',
    ].includes(stage);
  }

  static validateLeadChannel(channel: string): boolean {
    return ['whatsapp', 'email', 'phone', 'platform_message', 'in_person'].includes(channel);
  }

  static validateMarketSegment(segment: string): boolean {
    return ['student', 'professional', 'tourist', 'family'].includes(segment);
  }

  static validateSeasonalPeriod(period: string): boolean {
    return ['high', 'medium', 'low'].includes(period);
  }

  static validatePriceStrategy(strategy: string): boolean {
    return ['static', 'dynamic', 'seasonal'].includes(strategy);
  }

  static validatePropertyData(data: any): void {
    const errors: Record<string, string> = {};

    if (!data.owner_id) errors.owner_id = 'Owner ID is required';
    if (!data.address) errors.address = 'Address is required';
    if (!data.city) errors.city = 'City is required';
    if (!data.state || data.state.length !== 2)
      errors.state = 'State must be 2 characters';

    if (!this.validatePropertyType(data.type))
      errors.type = 'Invalid property type';

    if (!this.validateArea(data.area_m2))
      errors.area_m2 = 'Area must be between 1 and 999 m²';

    if (!this.validatePrice(data.base_monthly_rent))
      errors.base_monthly_rent = 'Monthly rent must be between 1 and 999,999';

    if (data.bedrooms && (data.bedrooms < 1 || data.bedrooms > 10))
      errors.bedrooms = 'Bedrooms must be between 1 and 10';

    if (data.bathrooms && (data.bathrooms < 1 || data.bathrooms > 5))
      errors.bathrooms = 'Bathrooms must be between 1 and 5';

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Invalid property data', errors);
    }
  }

  static validateListingData(data: any): void {
    const errors: Record<string, string> = {};

    if (!data.property_id) errors.property_id = 'Property ID is required';
    if (!this.validatePlatform(data.platform))
      errors.platform = 'Invalid platform';

    if (!data.title || data.title.length < 10)
      errors.title = 'Title must be at least 10 characters';

    if (!data.description || data.description.length < 20)
      errors.description = 'Description must be at least 20 characters';

    if (!this.validatePrice(data.base_price))
      errors.base_price = 'Price must be between 1 and 999,999';

    if (data.price_strategy && !this.validatePriceStrategy(data.price_strategy))
      errors.price_strategy = 'Invalid price strategy';

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Invalid listing data', errors);
    }
  }

  static validateLeadData(data: any): void {
    const errors: Record<string, string> = {};

    if (!data.property_id) errors.property_id = 'Property ID is required';
    if (!data.listing_id) errors.listing_id = 'Listing ID is required';
    if (!data.name || data.name.length < 2)
      errors.name = 'Name must be at least 2 characters';

    if (data.email && !this.validateEmail(data.email))
      errors.email = 'Invalid email format';

    if (data.phone && !this.validatePhone(data.phone))
      errors.phone = 'Invalid phone format';

    if (!data.source_channel)
      errors.source_channel = 'Source channel is required';

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Invalid lead data', errors);
    }
  }

  static sanitizeString(str: string): string {
    return str.trim().replace(/[<>]/g, '');
  }

  static sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) return obj;

    return Object.keys(obj).reduce((acc, key) => {
      const value = obj[key];
      if (typeof value === 'string') {
        acc[key] = this.sanitizeString(value);
      } else if (typeof value === 'object') {
        acc[key] = this.sanitizeObject(value);
      } else {
        acc[key] = value;
      }
      return acc;
    }, {} as any);
  }
}
