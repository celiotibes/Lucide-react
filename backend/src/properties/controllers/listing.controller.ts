import { Request, Response } from 'express';
import { Pool } from 'pg';
import { ListingService } from '../services/listing.service';
import { PricingService } from '../services/pricing.service';
import { Logger } from '../../shared/logger';

export class ListingController {
  private listingService: ListingService;
  private pricingService: PricingService;

  constructor(pool: Pool) {
    this.listingService = new ListingService(pool);
    this.pricingService = new PricingService(pool);
  }

  async getListing(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const listing = await this.listingService.getListingById(id);

      if (!listing) {
        res.status(404).json({ success: false, error: 'Listing not found' });
        return;
      }

      res.json({
        success: true,
        data: listing,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to get listing', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getPropertyListings(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId } = req.params;
      const listings = await this.listingService.getListingsByPropertyId(propertyId);

      res.json({
        success: true,
        data: listings,
        count: listings.length,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to get property listings', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getListingsByPlatform(req: Request, res: Response): Promise<void> {
    try {
      const { platform } = req.params;
      const { limit = '50', offset = '0' } = req.query;

      const listings = await this.listingService.getListingsByPlatform(
        platform,
        parseInt(limit as string),
        parseInt(offset as string)
      );

      res.json({
        success: true,
        data: listings,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          count: listings.length,
        },
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to get listings by platform', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async createListing(req: Request, res: Response): Promise<void> {
    try {
      const data = req.body;

      if (!data.property_id || !data.platform || !data.title || !data.description) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const listing = await this.listingService.createListing(data);

      res.status(201).json({
        success: true,
        data: listing,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to create listing', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updateListing(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = req.body;

      const listing = await this.listingService.updateListing(id, data);

      res.json({
        success: true,
        data: listing,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to update listing', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updateListingContent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title, description, highlights, amenitiesText } = req.body;

      if (!title || !description) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const listing = await this.listingService.updateListingContent(
        id,
        title,
        description,
        highlights || [],
        amenitiesText || ''
      );

      res.json({
        success: true,
        data: listing,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to update listing content', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async updateListingPrice(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { basePrice, strategy } = req.body;

      if (!basePrice || !strategy) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const listing = await this.listingService.updateListingPricing(id, basePrice, strategy);

      res.json({
        success: true,
        data: listing,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to update listing price', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async publishListing(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const listing = await this.listingService.publishListing(id);

      res.json({
        success: true,
        data: listing,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to publish listing', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async unpublishListing(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const listing = await this.listingService.unpublishListing(id);

      res.json({
        success: true,
        data: listing,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to unpublish listing', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getListingPerformance(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const performance = await this.listingService.getListingPerformance(id);

      res.json({
        success: true,
        data: performance,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to get listing performance', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async analyzePricing(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId } = req.params;
      const analysis = await this.pricingService.analyzePricing(propertyId);

      res.json({
        success: true,
        data: analysis,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to analyze pricing', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getCompetitiveAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { propertyId, city } = req.params;
      const analysis = await this.pricingService.getCompetitiveAnalysis(propertyId, city);

      res.json({
        success: true,
        data: analysis,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to get competitive analysis', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async getPendingSyncListings(req: Request, res: Response): Promise<void> {
    try {
      const listings = await this.listingService.getPendingSyncListings();

      res.json({
        success: true,
        data: listings,
        count: listings.length,
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to get pending sync listings', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  async deleteListing(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await this.listingService.deleteListing(id);

      res.json({
        success: true,
        message: 'Listing deleted successfully',
        timestamp: new Date(),
      });
    } catch (error) {
      Logger.error('listing-controller', 'Failed to delete listing', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
