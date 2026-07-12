import { Queue, Worker } from 'bullmq';
import { Pool } from 'pg';
import { LeadService } from '../services/lead.service';
import { Logger } from '../../shared/logger';

interface LeadManagementJob {
  leadId: string;
  action: 'respond' | 'follow_up' | 'qualify' | 'route';
}

export function createLeadManagementWorker(pool: Pool, redisConnection: unknown): Worker {
  const leadService = new LeadService(pool);

  const worker = new Worker(
    'lead-management',
    async (job) => {
      Logger.info('lead-management-worker', 'Processing lead management task', {
        jobId: job.id,
        leadId: job.data.leadId,
        action: job.data.action,
      });

      try {
        const { leadId, action } = job.data as LeadManagementJob;

        const lead = await leadService.getLeadById(leadId);
        if (!lead) {
          throw new Error(`Lead ${leadId} not found`);
        }

        switch (action) {
          case 'respond':
            return await handleLeadResponse(leadService, lead);
          case 'follow_up':
            return await handleFollowUp(leadService, lead);
          case 'qualify':
            return await handleQualification(leadService, lead);
          case 'route':
            return await routeLead(leadService, lead);
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      } catch (error) {
        Logger.error('lead-management-worker', 'Failed to process lead management task', error);
        throw error;
      }
    },
    {
      connection: redisConnection as any,
      concurrency: 10,
    }
  );

  worker.on('failed', (job, err) => {
    if (job) {
      Logger.error('lead-management-worker', 'Job failed', {
        jobId: job.id,
        error: err.message,
      });
    }
  });

  worker.on('completed', (job) => {
    Logger.info('lead-management-worker', 'Job completed', { jobId: job.id });
  });

  return worker;
}

async function handleLeadResponse(leadService: LeadService, lead: any): Promise<Record<string, unknown>> {
  // Send automated initial response
  const responseMessage = generateInitialResponse(lead);

  await leadService.recordTouchpoint(
    lead.id,
    'whatsapp', // Default channel
    'response',
    responseMessage,
    'outbound',
    {
      automated: true,
      template: 'initial_inquiry_response',
    }
  );

  // Update lead stage to contacted
  await leadService.updateLeadStage(lead.id, 'contacted');

  Logger.info('lead-management-worker', 'Sent initial response', {
    leadId: lead.id,
    channel: 'whatsapp',
  });

  return {
    success: true,
    leadId: lead.id,
    action: 'responded',
    timestamp: new Date(),
  };
}

async function handleFollowUp(leadService: LeadService, lead: any): Promise<Record<string, unknown>> {
  // Check if lead needs follow-up
  if (lead.stage === 'closed' || lead.stage === 'lost') {
    return { success: false, reason: 'Lead already closed or lost' };
  }

  // Check how long since last contact
  const hoursSinceContact = lead.last_contact_at
    ? (Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60)
    : 999;

  if (hoursSinceContact > 24) {
    // Send follow-up message
    const followUpMessage = generateFollowUpMessage(lead);

    await leadService.recordTouchpoint(
      lead.id,
      'whatsapp',
      'follow_up',
      followUpMessage,
      'outbound',
      {
        automated: true,
        template: 'follow_up_inquiry',
        dayssinceInquiry: Math.floor(hoursSinceContact / 24),
      }
    );

    Logger.info('lead-management-worker', 'Sent follow-up', {
      leadId: lead.id,
      hoursSinceLastContact: Math.round(hoursSinceContact),
    });

    return {
      success: true,
      leadId: lead.id,
      action: 'followed_up',
      hoursSinceLastContact: Math.round(hoursSinceContact),
    };
  }

  return { success: false, reason: 'Follow-up not needed yet' };
}

async function handleQualification(leadService: LeadService, lead: any): Promise<Record<string, unknown>> {
  // Analyze lead quality based on available information
  let qualityScore = 0;

  // Has contact info
  if (lead.email && lead.phone) qualityScore += 30;
  else if (lead.email || lead.phone) qualityScore += 15;

  // Engagement level
  const touchpoints = await leadService.getTouchpointsByLeadId(lead.id);
  if (touchpoints.length > 2) qualityScore += 25;
  else if (touchpoints.length > 0) qualityScore += 10;

  // Stage progression
  const stages = ['inquiry', 'contacted', 'tour_scheduled', 'touring', 'negotiation', 'closed', 'lost'];
  const currentStageIndex = stages.indexOf(lead.stage);
  if (currentStageIndex > 1) qualityScore += 35;

  // Estimated deal value
  if (lead.estimated_deal_value && lead.estimated_deal_value > 5000) qualityScore += 25;

  const qualified = qualityScore >= 60;

  Logger.info('lead-management-worker', 'Qualified lead', {
    leadId: lead.id,
    score: qualityScore,
    qualified,
  });

  return {
    success: true,
    leadId: lead.id,
    qualityScore,
    qualified,
    recommendations: getQualificationRecommendations(qualityScore, lead),
  };
}

async function routeLead(leadService: LeadService, lead: any): Promise<Record<string, unknown>> {
  // Route lead to appropriate channel/agent based on qualification
  const qualification = await handleQualification(leadService, lead);

  let recommendedChannel = 'whatsapp'; // Default
  let priority = 'low';

  if ((qualification as any).qualified) {
    if ((qualification as any).qualityScore >= 80) {
      priority = 'high';
      recommendedChannel = 'direct_call';
    } else {
      priority = 'medium';
      recommendedChannel = 'whatsapp';
    }
  }

  Logger.info('lead-management-worker', 'Routed lead', {
    leadId: lead.id,
    recommendedChannel,
    priority,
  });

  return {
    success: true,
    leadId: lead.id,
    recommendedChannel,
    priority,
    timestamp: new Date(),
  };
}

function generateInitialResponse(lead: any): string {
  return `Olá ${lead.name}! 👋

Obrigado pelo seu interesse em nosso imóvel! 🏠

Recebemos sua solicitação e em breve entraremos em contato para fornecer mais detalhes e agendar uma visita.

Quer agendar agora uma tour virtual? Responda aqui! 📱`;
}

function generateFollowUpMessage(lead: any): string {
  return `Oi ${lead.name}!

Você ainda tem interesse no imóvel que consultou? 🏠

Estamos aqui para responder qualquer dúvida e agendar sua visita!

Clique aqui para confirmar: [agendar tour]`;
}

function getQualificationRecommendations(score: number, lead: any): string[] {
  const recommendations: string[] = [];

  if (!lead.phone) {
    recommendations.push('Collect phone number for direct contact');
  }

  if (!lead.email) {
    recommendations.push('Collect email for documentation');
  }

  if (!lead.estimated_deal_value) {
    recommendations.push('Estimate deal value during next contact');
  }

  if (score < 40) {
    recommendations.push('Schedule property tour to increase engagement');
  }

  if (score >= 80) {
    recommendations.push('Prioritize for immediate follow-up');
  }

  return recommendations;
}

export async function enqueueLeadResponse(
  queue: Queue,
  leadId: string
): Promise<void> {
  await queue.add(
    'respond',
    {
      leadId,
      action: 'respond',
    } as LeadManagementJob,
    {
      delay: 1000, // Wait 1 second before sending response
      attempts: 2,
      removeOnComplete: true,
    }
  );

  Logger.info('lead-management-worker', 'Enqueued lead response', { leadId });
}

export async function enqueueFollowUp(
  queue: Queue,
  leadId: string
): Promise<void> {
  await queue.add(
    'follow_up',
    {
      leadId,
      action: 'follow_up',
    } as LeadManagementJob,
    {
      attempts: 2,
      removeOnComplete: true,
    }
  );

  Logger.info('lead-management-worker', 'Enqueued follow-up', { leadId });
}

export async function scheduleFollowUps(
  queue: Queue,
  leadService: LeadService
): Promise<void> {
  // Get leads needing follow-up
  const leadsNeedingFollowUp = await leadService.getLeadsNeedingFollowUp(24);

  for (const lead of leadsNeedingFollowUp) {
    await enqueueFollowUp(queue, lead.id);
  }

  Logger.info('lead-management-worker', 'Scheduled follow-ups', {
    count: leadsNeedingFollowUp.length,
  });
}
