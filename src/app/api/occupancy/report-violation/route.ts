import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { OccupancyService } from '@/services/OccupancyService';
import { ReportOccupancyViolationRequest, ApiResponse } from '@/types/api-requests';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const body: ReportOccupancyViolationRequest = await request.json();
    const occupancyService = new OccupancyService(supabase);

    if (!body.lease_id || !body.property_id || !body.violation_type) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'lease_id, property_id, and violation_type are required',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const violation = await occupancyService.reportViolation(
      body.lease_id as any,
      body.property_id as any,
      body.aluguel_efetivo,
      body.violation_type,
      body.detection_evidence,
      body.detection_method
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          id: violation.id,
          lease_id: violation.lease_id,
          violation_type: violation.violation_type,
          fine_amount_brl: violation.fine_amount_brl,
          fine_status: violation.fine_status,
          created_at: violation.created_at.toISOString(),
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
          code: 'VIOLATION_REPORT_FAILED',
          message,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
