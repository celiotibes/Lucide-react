/**
 * Webhook Handler: Hospeda.com
 * Eventos: booking.created, booking.confirmed, review.received, etc
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { Logger } from '../shared/logger';
import HospedaClient from '../integrations/hospeda/hospeda-client';

const logger = Logger.getLogger('HospedaWebhook');
const router = Router();

router.post('/hospeda', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-hospeda-signature'] as string;
    const payload = JSON.stringify(req.body);

    const webhook = await getHospedaWebhook(req.body.user_id);
    if (!webhook) {
      return res.status(401).json({ error: 'Webhook not found' });
    }

    const hospeda = new HospedaClient('');
    const isValid = hospeda.verifyWebhookSignature(
      payload,
      signature,
      webhook.webhook_secret
    );

    if (!isValid) {
      logger.warn('Invalid Hospeda webhook signature', { userId: req.body.user_id });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    logger.info('Hospeda webhook received', {
      event_type: req.body.type,
      user_id: req.body.user_id,
    });

    switch (req.body.type) {
      case 'booking.created':
        await handleBookingCreated(req.body);
        break;
      case 'booking.confirmed':
        await handleBookingConfirmed(req.body);
        break;
      case 'booking.cancelled':
        await handleBookingCancelled(req.body);
        break;
      case 'review.received':
        await handleReviewReceived(req.body);
        break;
      default:
        logger.warn('Unknown Hospeda event', { type: req.body.type });
    }

    res.status(200).json({ status: 'received' });
  } catch (error) {
    logger.error('Hospeda webhook error', { error });
    res.status(500).json({ error: 'Internal error' });
  }
});

async function handleBookingCreated(event: any) {
  const { user_id, property_id, booking } = event;

  await pool.query(
    `INSERT INTO leads 
     (property_id, guest_name, email, phone, check_in, check_out, 
      guests, total_price, platform, external_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (platform, external_id) DO NOTHING`,
    [
      property_id,
      booking.guest_name,
      booking.guest_email,
      booking.guest_phone,
      booking.check_in,
      booking.check_out,
      booking.guests,
      booking.total_price,
      'hospeda',
      booking.id,
      'new',
    ]
  );

  logger.info('Hospeda booking created', { bookingId: booking.id, userId: user_id });
}

async function handleBookingConfirmed(event: any) {
  await pool.query(
    `UPDATE leads SET status = 'confirmed' 
     WHERE platform = 'hospeda' AND external_id = $1`,
    [event.booking_id]
  );
}

async function handleBookingCancelled(event: any) {
  await pool.query(
    `UPDATE leads SET status = 'cancelled' 
     WHERE platform = 'hospeda' AND external_id = $1`,
    [event.booking_id]
  );
}

async function handleReviewReceived(event: any) {
  const { property_id, review } = event;

  await pool.query(
    `INSERT INTO platform_ratings 
     (property_id, platform, external_id, rating, review_text, reviewer_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [
      property_id,
      'hospeda',
      review.id,
      review.rating,
      review.text,
      review.guest_name,
    ]
  );

  logger.info('Hospeda review received', { 
    propertyId: property_id, 
    rating: review.rating 
  });
}

async function getHospedaWebhook(userId: string) {
  const result = await pool.query(
    'SELECT * FROM webhooks WHERE user_id = $1 AND platform = $2',
    [userId, 'hospeda']
  );
  return result.rows[0];
}

export default router;
