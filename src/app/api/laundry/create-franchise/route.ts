import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { LaundryService } from '@/services/LaundryService';
import { CreateLaundryFranchiseRequest, ApiResponse, CreateLaundryFranchiseResponse } from '@/types/api-requests';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<CreateLaundryFranchiseResponse>>> {
  try {
    const body: CreateLaundryFranchiseRequest = await request.json();
    const laundryService = new LaundryService(supabase);

    if (!body.lease_id || !body.resident_count || body.resident_count < 1) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'lease_id and resident_count (min 1) are required',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const franchise = await laundryService.createFranchise(body.lease_id as any, body.resident_count);

    return NextResponse.json(
      {
        success: true,
        data: {
          id: franchise.id,
          lease_id: franchise.lease_id,
          cycles_per_month_included: franchise.cycles_per_month_included,
          total_cycles_available: franchise.total_cycles_available,
          remaining_cycles: franchise.remaining_cycles,
          created_at: franchise.created_at.toISOString(),
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
          code: 'LAUNDRY_FRANCHISE_CREATE_FAILED',
          message,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
