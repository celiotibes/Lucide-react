import { NextRequest, NextResponse } from 'next/server';
import { InspectionService } from '@/services/InspectionService';
import { CreateInspectionRequest, ApiResponse, CreateInspectionResponse } from '@/types/api-requests';

const inspectionService = new InspectionService();

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<CreateInspectionResponse>>> {
  try {
    const body: CreateInspectionRequest = await request.json();

    // Validate video quality before creating inspection
    if (!inspectionService.validateVideoQuality(body.video_size_mb, body.video_duration_seconds)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_VIDEO_QUALITY',
            message: 'Video must be at least 50MB and 30 seconds duration (HD 1080p minimum)',
            details: {
              video_size_mb: body.video_size_mb,
              video_duration_seconds: body.video_duration_seconds,
            },
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const inspection = await inspectionService.createInspection(
      body.lease_id as any,
      body.property_id as any,
      body.video_url,
      body.video_size_mb,
      body.video_duration_seconds,
      body.uploaded_by_email
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          id: inspection.id,
          lease_id: inspection.lease_id,
          inspection_type: inspection.inspection_type,
          status: inspection.status,
          deadline_challenge_date: inspection.deadline_challenge_date.toISOString(),
          deadline_rad_date: inspection.deadline_rad_date.toISOString(),
          deadline_return_deposit_date: inspection.deadline_return_deposit_date.toISOString(),
          created_at: inspection.created_at.toISOString(),
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
          code: 'INSPECTION_CREATE_FAILED',
          message,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
