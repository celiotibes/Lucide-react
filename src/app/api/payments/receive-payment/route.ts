import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { CriticalDatesService } from '@/services/CriticalDatesService';
import { ProcessPaymentReceivedRequest, ApiResponse } from '@/types/api-requests';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const body: ProcessPaymentReceivedRequest = await request.json();
    const criticalDatesService = new CriticalDatesService(supabase);

    if (!body.cycle_id || !body.amount_received || !body.receive_date) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'cycle_id, amount_received, and receive_date are required',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Fetch the cycle from database
    const { data: cycle, error: fetchError } = await supabase
      .from('payment_cycles')
      .select('*')
      .eq('id', body.cycle_id)
      .single();

    if (fetchError || !cycle) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CYCLE_NOT_FOUND',
            message: `Payment cycle ${body.cycle_id} not found`,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    // Process payment
    const receiveDate = new Date(body.receive_date);
    const updatedCycle = await criticalDatesService.processPaymentReceived(
      cycle,
      body.amount_received,
      receiveDate
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          cycle_id: updatedCycle.id,
          payment_status: updatedCycle.payment_status,
          payment_received_date: updatedCycle.payment_received_date?.toISOString(),
          amount_received: updatedCycle.payment_amount_received,
          days_late: updatedCycle.days_late,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PAYMENT_PROCESS_FAILED',
          message,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
