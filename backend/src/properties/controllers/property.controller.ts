import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { PropertyService } from '../services/property.service';
import { Logger } from '../../shared/logger';

export class PropertyController {
  private service: PropertyService;

  constructor(pool: Pool) {
    this.service = new PropertyService(pool);
  }

  async getProperty(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const property = await this.service.getPropertyById(id);

      if (!property) {
        res.status(404).json({ success: false, error: 'Property not found' });
        return;
      }

      res.json({
        success: true,
        data: property,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('property-controller', 'Failed to get property', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getProperties(req: Request, res: Response): Promise<void> {
    try {
      const { ownerId, city, limit = '50', offset = '0' } = req.query;

      let properties;
      if (ownerId) {
        properties = await this.service.getPropertiesByOwnerId(
          ownerId as string,
          parseInt(limit as string),
          parseInt(offset as string)
        );
      } else if (city) {
        properties = await this.service.getPropertiesByCity(
          city as string,
          parseInt(limit as string),
          parseInt(offset as string)
        );
      } else {
        properties = await this.service.getAllProperties(
          parseInt(limit as string),
          parseInt(offset as string)
        );
      }

      res.json({
        success: true,
        data: properties,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          count: properties.length,
        },
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('property-controller', 'Failed to get properties', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async createProperty(req: Request, res: Response): Promise<void> {
    try {
      const data = req.body;

      // Validate required fields
      if (!data.owner_id || !data.address || !data.city || !data.type) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const property = await this.service.createProperty(data);

      res.status(201).json({
        success: true,
        data: property,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('property-controller', 'Failed to create property', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updateProperty(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = req.body;

      const property = await this.service.updateProperty(id, data);

      res.json({
        success: true,
        data: property,
        timestamp: new Date(),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ success: false, error: 'Property not found' });
        return;
      }
      Logger.error('property-controller', 'Failed to update property', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updatePropertyStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'maintenance', 'off_season', 'archived'].includes(status)) {
        res.status(400).json({ success: false, error: 'Invalid status' });
        return;
      }

      const property = await this.service.updatePropertyStatus(id, status);

      res.json({
        success: true,
        data: property,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('property-controller', 'Failed to update property status', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getPropertyWithListings(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = await this.service.getPropertyWithListings(id);

      if (!data) {
        res.status(404).json({ success: false, error: 'Property not found' });
        return;
      }

      res.json({
        success: true,
        data,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('property-controller', 'Failed to get property with listings', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getPropertyDashboard(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dashboard = await this.service.getPropertyDashboard(id);

      if (!dashboard) {
        res.status(404).json({ success: false, error: 'Property not found' });
        return;
      }

      res.json({
        success: true,
        data: dashboard,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('property-controller', 'Failed to get property dashboard', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getPropertyStats(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { months = '12' } = req.query;

      const stats = await this.service.getPropertyStats(id, parseInt(months as string));

      res.json({
        success: true,
        data: stats,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('property-controller', 'Failed to get property stats', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async deleteProperty(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await this.service.deleteProperty(id);

      res.json({
        success: true,
        message: 'Property deleted successfully',
        timestamp: new Date(),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ success: false, error: 'Property not found' });
        return;
      }
      Logger.error('property-controller', 'Failed to delete property', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
