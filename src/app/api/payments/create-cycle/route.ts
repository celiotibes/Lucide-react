import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { CriticalDatesService } from '@/services/CriticalDatesService';
import { CreatePaymentCycleRequest, ApiResponse, CreatePaymentCycleResponse } from '@/types/api-requests';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<CreatePaymentCycleResponse>>> {
  try {
    const body: CreatePaymentCycleRequest = await request.json();
    const criticalDatesService = new CriticalDatesService(supabase);

    if (!body.lease_id || !body.property_id || !body.billing_month || !body.billing_year) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'lease_id, property_id, billing_month, and billing_year are required',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const cycle = await criticalDatesService.createPaymentCycle(
      body.lease_id as any,
      body.property_id as any,
      body.billing_month,
      body.billing_year,
      body.aluguel_efetivo,
      body.cota_custeio
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          id: cycle.id,
          lease_id: cycle.lease_id,
          billing_month: cycle.billing_month,
          billing_year: cycle.billing_year,
          due_date: cycle.due_date.toISOString(),
          value_brl: cycle.value_brl,
          aluguel_efetivo: cycle.aluguel_efetivo,
          cota_custeio: cycle.cota_custeio,
          payment_status: cycle.payment_status,
          created_at: cycle.created_at.toISOString(),
        },
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PAYMENT_CYCLE_CREATE_FAILED',
          message,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
