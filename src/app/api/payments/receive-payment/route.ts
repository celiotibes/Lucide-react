import { NextRequest, NextResponse } from 'next/server';
import { CriticalDatesService } from '@/services/CriticalDatesService';
import { ProcessPaymentReceivedRequest, ApiResponse } from '@/types/api-requests';

const criticalDatesService = new CriticalDatesService();

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const body: ProcessPaymentReceivedRequest = await request.json();

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

    // In production, fetch the cycle from database first
    // For now, this is a placeholder that shows the structure

    return NextResponse.json(
      {
        success: true,
        data: {
          cycle_id: body.cycle_id,
          payment_status: 'collected',
          payment_received_date: body.receive_date,
          amount_received: body.amount_received,
          days_late: 0,
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
