import { Router } from 'express';
import { Pool } from 'pg';
import { PropertyController } from '../controllers/property.controller';
import { ListingController } from '../controllers/listing.controller';

export function createPropertiesRouter(pool: Pool): Router {
  const router = Router();
  const propertyController = new PropertyController(pool);
  const listingController = new ListingController(pool);

  // Property routes
  router.get('/properties/:id', (req, res) => propertyController.getProperty(req, res));
  router.get('/properties', (req, res) => propertyController.getProperties(req, res));
  router.post('/properties', (req, res) => propertyController.createProperty(req, res));
  router.put('/properties/:id', (req, res) => propertyController.updateProperty(req, res));
  router.patch('/properties/:id/status', (req, res) => propertyController.updatePropertyStatus(req, res));

  // Property detail routes
  router.get('/properties/:id/with-listings', (req, res) =>
    propertyController.getPropertyWithListings(req, res)
  );
  router.get('/properties/:id/dashboard', (req, res) =>
    propertyController.getPropertyDashboard(req, res)
  );
  router.get('/properties/:id/stats', (req, res) =>
    propertyController.getPropertyStats(req, res)
  );

  router.delete('/properties/:id', (req, res) => propertyController.deleteProperty(req, res));

  // Listing routes
  router.get('/listings/:id', (req, res) => listingController.getListing(req, res));
  router.get('/properties/:propertyId/listings', (req, res) =>
    listingController.getPropertyListings(req, res)
  );
  router.get('/listings/platform/:platform', (req, res) =>
    listingController.getListingsByPlatform(req, res)
  );
  router.post('/listings', (req, res) => listingController.createListing(req, res));
  router.put('/listings/:id', (req, res) => listingController.updateListing(req, res));

  // Listing content & pricing
  router.put('/listings/:id/content', (req, res) =>
    listingController.updateListingContent(req, res)
  );
  router.put('/listings/:id/price', (req, res) =>
    listingController.updateListingPrice(req, res)
  );
  router.patch('/listings/:id/publish', (req, res) =>
    listingController.publishListing(req, res)
  );
  router.patch('/listings/:id/unpublish', (req, res) =>
    listingController.unpublishListing(req, res)
  );

  // Listing analytics
  router.get('/listings/:id/performance', (req, res) =>
    listingController.getListingPerformance(req, res)
  );
  router.get('/listings/pending-sync', (req, res) =>
    listingController.getPendingSyncListings(req, res)
  );

  // Pricing analysis
  router.get('/properties/:propertyId/pricing', (req, res) =>
    listingController.analyzePricing(req, res)
  );
  router.get('/properties/:propertyId/pricing/competitive/:city', (req, res) =>
    listingController.getCompetitiveAnalysis(req, res)
  );

  router.delete('/listings/:id', (req, res) => listingController.deleteListing(req, res));

  return router;
}
