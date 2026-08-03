/**
 * GraphQL Mutation Resolvers
 * Handles all write operations (mutations) for the GraphQL API
 */

import { IResolvers } from '@graphql-tools/utils';
import { clientRepository, caseRepository, contractRepository, invoiceRepository, intimationRepository } from '@/database/repositoryFactory';
import { NotFoundError, ValidationError, ConflictError } from '@utils/errors';
import { CPFValidator, CNPJValidator, EmailValidator } from '@utils/validators';
import { eventService, EVENTS } from '@services/EventEmitterService';
import { logger } from '@utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Mutation Resolvers
 */
export const mutationResolvers: IResolvers = {
  Mutation: {
    // ========================================================================
    // CLIENT MUTATIONS
    // ========================================================================

    createClient: async (
      _: any,
      { input }: { input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        // Validate input
        if (!input.name || !input.email) {
          throw new ValidationError('Name and email are required');
        }

        // Validate email
        EmailValidator.throwIfInvalid(input.email, 'email');

        // Validate CPF if provided
        if (input.cpf) {
          CPFValidator.throwIfInvalid(input.cpf, 'cpf');
        }

        // Validate CNPJ if provided
        if (input.cnpj) {
          CNPJValidator.throwIfInvalid(input.cnpj, 'cnpj');
        }

        // Check if email already exists
        const existingClient = await clientRepository.findByProperty('email', input.email);
        if (existingClient) {
          throw new ConflictError('Email already exists', { email: input.email });
        }

        // Create client
        const clientData = {
          id: `client-${uuidv4()}`,
          name: input.name,
          email: input.email,
          phone: input.phone,
          cpf: input.cpf,
          cnpj: input.cnpj,
          status: input.status || 'PROSPECT',
          case_types: input.caseTypes || [],
          address: input.address,
          city: input.city,
          state: input.state,
          zip_code: input.zipCode,
          contact_person: input.contactPerson,
          industry: input.industry,
          company_size: input.companySize,
          notes: input.notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const client = await clientRepository.create(clientData);

        // Publish event
        eventService.emit(EVENTS.CLIENT_CREATED, {
          clientId: client.id,
          name: client.name,
          email: client.email,
        });

        logger.info({ clientId: client.id }, 'Client created via GraphQL');

        return {
          client,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, input }, 'Failed to create client');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          client: null,
          errors,
          success: false,
        };
      }
    },

    updateClient: async (
      _: any,
      { id, input }: { id: string; input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        // Fetch existing client
        const client = await clientRepository.read(id);
        if (!client) {
          throw new NotFoundError('Client', id);
        }

        // Validate email if changed
        if (input.email && input.email !== client.email) {
          EmailValidator.throwIfInvalid(input.email, 'email');
          const existing = await clientRepository.findByProperty('email', input.email);
          if (existing) {
            throw new ConflictError('Email already exists');
          }
        }

        // Update client
        const updates: Record<string, any> = {};
        if (input.name) updates.name = input.name;
        if (input.phone) updates.phone = input.phone;
        if (input.status) updates.status = input.status;
        if (input.caseTypes) updates.case_types = input.caseTypes;
        if (input.address) updates.address = input.address;
        if (input.city) updates.city = input.city;
        if (input.state) updates.state = input.state;
        if (input.industry) updates.industry = input.industry;
        if (input.notes) updates.notes = input.notes;
        updates.updated_at = new Date().toISOString();

        const updatedClient = await clientRepository.update(id, updates);

        // Publish event
        eventService.emit(EVENTS.CLIENT_UPDATED, {
          clientId: id,
          updates,
        });

        logger.info({ clientId: id }, 'Client updated via GraphQL');

        return {
          client: updatedClient,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, clientId: id }, 'Failed to update client');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          client: null,
          errors,
          success: false,
        };
      }
    },

    deleteClient: async (
      _: any,
      { id }: { id: string },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        // Check if client exists
        const client = await clientRepository.read(id);
        if (!client) {
          throw new NotFoundError('Client', id);
        }

        // Soft delete (mark as deleted)
        await clientRepository.update(id, { deleted_at: new Date().toISOString() });

        // Publish event
        eventService.emit(EVENTS.CLIENT_DELETED, {
          clientId: id,
        });

        logger.info({ clientId: id }, 'Client deleted via GraphQL');

        return {
          success: true,
          errors: [],
        };
      } catch (error) {
        logger.error({ error, clientId: id }, 'Failed to delete client');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          success: false,
          errors,
        };
      }
    },

    // ========================================================================
    // CASE MUTATIONS
    // ========================================================================

    createCase: async (
      _: any,
      { input }: { input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        if (!input.clientId || !input.caseNumber || !input.caseType) {
          throw new ValidationError('clientId, caseNumber, and caseType are required');
        }

        // Verify client exists
        const client = await clientRepository.read(input.clientId);
        if (!client) {
          throw new NotFoundError('Client', input.clientId);
        }

        // Check if case number already exists
        const existing = await caseRepository.findByProperty('case_number', input.caseNumber);
        if (existing) {
          throw new ConflictError('Case number already exists');
        }

        // Create case
        const caseData = {
          id: `case-${uuidv4()}`,
          case_number: input.caseNumber,
          client_id: input.clientId,
          case_type: input.caseType,
          court_name: input.courtName,
          judge_name: input.judgeName,
          process_number: input.processNumber,
          status: 'REGISTERED',
          filing_date: input.filingDate,
          deadline_date: input.deadlineDate,
          amount_claimed: input.amountClaimed || 0,
          lawyer_assigned: input.lawyerAssigned,
          notes: input.notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const legalCase = await caseRepository.create(caseData);

        // Publish event
        eventService.emit(EVENTS.CASE_CREATED, {
          caseId: legalCase.id,
          caseNumber: legalCase.case_number,
          clientId: legalCase.client_id,
        });

        logger.info({ caseId: legalCase.id }, 'Case created via GraphQL');

        return {
          case: legalCase,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, input }, 'Failed to create case');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          case: null,
          errors,
          success: false,
        };
      }
    },

    updateCase: async (
      _: any,
      { id, input }: { id: string; input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const legalCase = await caseRepository.read(id);
        if (!legalCase) {
          throw new NotFoundError('Case', id);
        }

        const updates: Record<string, any> = {};
        if (input.caseType) updates.case_type = input.caseType;
        if (input.courtName) updates.court_name = input.courtName;
        if (input.judgeName) updates.judge_name = input.judgeName;
        if (input.status) updates.status = input.status;
        if (input.notes) updates.notes = input.notes;
        updates.updated_at = new Date().toISOString();

        const updatedCase = await caseRepository.update(id, updates);

        eventService.emit(EVENTS.CASE_UPDATED, {
          caseId: id,
          updates,
        });

        logger.info({ caseId: id }, 'Case updated via GraphQL');

        return {
          case: updatedCase,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, caseId: id }, 'Failed to update case');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          case: null,
          errors,
          success: false,
        };
      }
    },

    updateCaseStatus: async (
      _: any,
      { id, status }: { id: string; status: string },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const legalCase = await caseRepository.read(id);
        if (!legalCase) {
          throw new NotFoundError('Case', id);
        }

        const updatedCase = await caseRepository.update(id, {
          status,
          updated_at: new Date().toISOString(),
        });

        eventService.emit(EVENTS.CASE_STATUS_CHANGED, {
          caseId: id,
          previousStatus: legalCase.status,
          newStatus: status,
        });

        logger.info({ caseId: id, newStatus: status }, 'Case status updated via GraphQL');

        return {
          case: updatedCase,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, caseId: id }, 'Failed to update case status');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          case: null,
          errors,
          success: false,
        };
      }
    },

    recordCaseOutcome: async (
      _: any,
      { id, input }: { id: string; input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const legalCase = await caseRepository.read(id);
        if (!legalCase) {
          throw new NotFoundError('Case', id);
        }

        const updatedCase = await caseRepository.update(id, {
          outcome: input.outcome,
          outcome_description: input.outcomeDescription,
          amount_awarded: input.amountAwarded,
          status: 'CLOSED',
          updated_at: new Date().toISOString(),
        });

        eventService.emit(EVENTS.CASE_OUTCOME_RECORDED, {
          caseId: id,
          outcome: input.outcome,
        });

        logger.info({ caseId: id, outcome: input.outcome }, 'Case outcome recorded via GraphQL');

        return {
          case: updatedCase,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, caseId: id }, 'Failed to record case outcome');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          case: null,
          errors,
          success: false,
        };
      }
    },

    deleteCase: async (
      _: any,
      { id }: { id: string },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const legalCase = await caseRepository.read(id);
        if (!legalCase) {
          throw new NotFoundError('Case', id);
        }

        await caseRepository.update(id, { deleted_at: new Date().toISOString() });

        eventService.emit(EVENTS.CASE_DELETED, {
          caseId: id,
        });

        logger.info({ caseId: id }, 'Case deleted via GraphQL');

        return {
          success: true,
          errors: [],
        };
      } catch (error) {
        logger.error({ error, caseId: id }, 'Failed to delete case');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          success: false,
          errors,
        };
      }
    },

    // ========================================================================
    // CONTRACT MUTATIONS
    // ========================================================================

    createContract: async (
      _: any,
      { input }: { input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        if (!input.clientId || !input.title || !input.content) {
          throw new ValidationError('clientId, title, and content are required');
        }

        const client = await clientRepository.read(input.clientId);
        if (!client) {
          throw new NotFoundError('Client', input.clientId);
        }

        const contractData = {
          id: `contract-${uuidv4()}`,
          client_id: input.clientId,
          title: input.title,
          description: input.description,
          content: input.content,
          status: 'DRAFT',
          version: 1,
          signature_required: input.signatureRequired || true,
          signers: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const contract = await contractRepository.create(contractData);

        eventService.emit(EVENTS.CONTRACT_CREATED, {
          contractId: contract.id,
          clientId: contract.client_id,
        });

        logger.info({ contractId: contract.id }, 'Contract created via GraphQL');

        return {
          contract,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, input }, 'Failed to create contract');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          contract: null,
          errors,
          success: false,
        };
      }
    },

    updateContract: async (
      _: any,
      { id, input }: { id: string; input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const contract = await contractRepository.read(id);
        if (!contract) {
          throw new NotFoundError('Contract', id);
        }

        const updates: Record<string, any> = {};
        if (input.title) updates.title = input.title;
        if (input.description) updates.description = input.description;
        if (input.content) updates.content = input.content;
        if (input.status) updates.status = input.status;
        updates.updated_at = new Date().toISOString();

        const updatedContract = await contractRepository.update(id, updates);

        eventService.emit(EVENTS.CONTRACT_UPDATED, {
          contractId: id,
          updates,
        });

        logger.info({ contractId: id }, 'Contract updated via GraphQL');

        return {
          contract: updatedContract,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, contractId: id }, 'Failed to update contract');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          contract: null,
          errors,
          success: false,
        };
      }
    },

    signContract: async (
      _: any,
      { id, input }: { id: string; input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const contract = await contractRepository.read(id);
        if (!contract) {
          throw new NotFoundError('Contract', id);
        }

        // Add signer
        const signers = contract.signers || [];
        signers.push({
          id: uuidv4(),
          name: input.signerName,
          email: input.signerEmail,
          signedAt: new Date().toISOString(),
          signature: input.signatureData,
        });

        // Update contract
        const updates: Record<string, any> = {
          signers,
          status: 'SIGNED',
          signed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const updatedContract = await contractRepository.update(id, updates);

        eventService.emit(EVENTS.CONTRACT_SIGNED, {
          contractId: id,
          signer: input.signerName,
        });

        logger.info({ contractId: id, signer: input.signerName }, 'Contract signed via GraphQL');

        return {
          contract: updatedContract,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, contractId: id }, 'Failed to sign contract');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          contract: null,
          errors,
          success: false,
        };
      }
    },

    deleteContract: async (
      _: any,
      { id }: { id: string },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const contract = await contractRepository.read(id);
        if (!contract) {
          throw new NotFoundError('Contract', id);
        }

        await contractRepository.update(id, { deleted_at: new Date().toISOString() });

        eventService.emit(EVENTS.CONTRACT_DELETED, {
          contractId: id,
        });

        logger.info({ contractId: id }, 'Contract deleted via GraphQL');

        return {
          success: true,
          errors: [],
        };
      } catch (error) {
        logger.error({ error, contractId: id }, 'Failed to delete contract');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          success: false,
          errors,
        };
      }
    },

    // ========================================================================
    // INVOICE MUTATIONS
    // ========================================================================

    createInvoice: async (
      _: any,
      { input }: { input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        if (!input.clientId || !input.invoiceNumber || !input.amount) {
          throw new ValidationError('clientId, invoiceNumber, and amount are required');
        }

        const client = await clientRepository.read(input.clientId);
        if (!client) {
          throw new NotFoundError('Client', input.clientId);
        }

        // Check if invoice number exists
        const existing = await invoiceRepository.findByProperty('invoice_number', input.invoiceNumber);
        if (existing) {
          throw new ConflictError('Invoice number already exists');
        }

        const invoiceData = {
          id: `invoice-${uuidv4()}`,
          invoice_number: input.invoiceNumber,
          client_id: input.clientId,
          case_id: input.caseId,
          amount: input.amount,
          amount_paid: 0,
          currency: 'BRL',
          status: 'SENT',
          description: input.description,
          due_date: input.dueDate,
          issued_date: input.issuedDate,
          payment_method: input.paymentMethod,
          notes: input.notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const invoice = await invoiceRepository.create(invoiceData);

        eventService.emit(EVENTS.INVOICE_CREATED, {
          invoiceId: invoice.id,
          clientId: invoice.client_id,
          amount: invoice.amount,
        });

        logger.info({ invoiceId: invoice.id }, 'Invoice created via GraphQL');

        return {
          invoice,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, input }, 'Failed to create invoice');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          invoice: null,
          errors,
          success: false,
        };
      }
    },

    updateInvoice: async (
      _: any,
      { id, input }: { id: string; input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const invoice = await invoiceRepository.read(id);
        if (!invoice) {
          throw new NotFoundError('Invoice', id);
        }

        const updates: Record<string, any> = {};
        if (input.amount) updates.amount = input.amount;
        if (input.dueDate) updates.due_date = input.dueDate;
        if (input.paymentMethod) updates.payment_method = input.paymentMethod;
        if (input.notes) updates.notes = input.notes;
        updates.updated_at = new Date().toISOString();

        const updatedInvoice = await invoiceRepository.update(id, updates);

        eventService.emit(EVENTS.INVOICE_UPDATED, {
          invoiceId: id,
          updates,
        });

        logger.info({ invoiceId: id }, 'Invoice updated via GraphQL');

        return {
          invoice: updatedInvoice,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, invoiceId: id }, 'Failed to update invoice');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          invoice: null,
          errors,
          success: false,
        };
      }
    },

    recordPayment: async (
      _: any,
      { invoiceId, input }: { invoiceId: string; input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const invoice = await invoiceRepository.read(invoiceId);
        if (!invoice) {
          throw new NotFoundError('Invoice', invoiceId);
        }

        const amountPaid = (invoice.amount_paid || 0) + input.amountPaid;
        const status = amountPaid >= invoice.amount ? 'PAID' : 'PARTIALLY_PAID';

        const updatedInvoice = await invoiceRepository.update(invoiceId, {
          amount_paid: amountPaid,
          status,
          payment_method: input.paymentMethod,
          receipt_url: input.receiptUrl,
          paid_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        eventService.emit(EVENTS.PAYMENT_RECEIVED, {
          invoiceId,
          amountPaid: input.amountPaid,
        });

        logger.info({ invoiceId, amountPaid: input.amountPaid }, 'Payment recorded via GraphQL');

        return {
          invoice: updatedInvoice,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, invoiceId }, 'Failed to record payment');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          invoice: null,
          errors,
          success: false,
        };
      }
    },

    deleteInvoice: async (
      _: any,
      { id }: { id: string },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const invoice = await invoiceRepository.read(id);
        if (!invoice) {
          throw new NotFoundError('Invoice', id);
        }

        await invoiceRepository.update(id, { deleted_at: new Date().toISOString() });

        eventService.emit(EVENTS.INVOICE_DELETED, {
          invoiceId: id,
        });

        logger.info({ invoiceId: id }, 'Invoice deleted via GraphQL');

        return {
          success: true,
          errors: [],
        };
      } catch (error) {
        logger.error({ error, invoiceId: id }, 'Failed to delete invoice');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          success: false,
          errors,
        };
      }
    },

    // ========================================================================
    // INTIMATION MUTATIONS
    // ========================================================================

    createIntimation: async (
      _: any,
      { input }: { input: any },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        if (!input.caseId || !input.documentType || !input.title) {
          throw new ValidationError('caseId, documentType, and title are required');
        }

        const legalCase = await caseRepository.read(input.caseId);
        if (!legalCase) {
          throw new NotFoundError('Case', input.caseId);
        }

        const intimationData = {
          id: `intimation-${uuidv4()}`,
          case_id: input.caseId,
          document_type: input.documentType,
          title: input.title,
          content: input.content,
          received_date: input.receivedDate,
          deadline_date: input.deadlineDate,
          notification_method: input.notificationMethod,
          sender_name: input.senderName,
          document_url: input.documentUrl,
          is_processed: false,
          notes: input.notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const intimation = await intimationRepository.create(intimationData);

        eventService.emit(EVENTS.INTIMATION_RECEIVED, {
          intimationId: intimation.id,
          caseId: intimation.case_id,
        });

        logger.info({ intimationId: intimation.id }, 'Intimation created via GraphQL');

        return {
          intimation,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, input }, 'Failed to create intimation');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          intimation: null,
          errors,
          success: false,
        };
      }
    },

    markIntimationProcessed: async (
      _: any,
      { id }: { id: string },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const intimation = await intimationRepository.read(id);
        if (!intimation) {
          throw new NotFoundError('Intimation', id);
        }

        const updatedIntimation = await intimationRepository.update(id, {
          is_processed: true,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        eventService.emit(EVENTS.INTIMATION_PROCESSED, {
          intimationId: id,
        });

        logger.info({ intimationId: id }, 'Intimation marked as processed via GraphQL');

        return {
          intimation: updatedIntimation,
          errors: [],
          success: true,
        };
      } catch (error) {
        logger.error({ error, intimationId: id }, 'Failed to mark intimation as processed');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          intimation: null,
          errors,
          success: false,
        };
      }
    },

    deleteIntimation: async (
      _: any,
      { id }: { id: string },
      context: any,
    ) => {
      const errors: string[] = [];

      try {
        const intimation = await intimationRepository.read(id);
        if (!intimation) {
          throw new NotFoundError('Intimation', id);
        }

        await intimationRepository.delete(id);

        eventService.emit(EVENTS.INTIMATION_DELETED, {
          intimationId: id,
        });

        logger.info({ intimationId: id }, 'Intimation deleted via GraphQL');

        return {
          success: true,
          errors: [],
        };
      } catch (error) {
        logger.error({ error, intimationId: id }, 'Failed to delete intimation');
        errors.push(error instanceof Error ? error.message : 'Unknown error');

        return {
          success: false,
          errors,
        };
      }
    },
  },
};
