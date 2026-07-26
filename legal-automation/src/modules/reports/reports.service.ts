// src/modules/reports/reports.service.ts
import { Database } from '@/database';
import {
  Report,
  ReportType,
  ReportFormat,
  CaseAnalyticsData,
  FinancialAnalyticsData,
  PerformanceMetrics,
  TimelineData,
  Dashboard,
  DashboardWidget,
  MetricCard,
  ChartData,
} from './types';

export class ReportsService {
  constructor(private db: Database) {}

  /**
   * Generate case analytics report
   */
  async generateCaseAnalytics(userId: string, fromDate?: Date, toDate?: Date): Promise<CaseAnalyticsData> {
    const dateFilter = this.buildDateFilter(fromDate, toDate);

    // Get case summary
    const caseSummaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open_cases,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_cases,
        COUNT(*) as total_cases,
        AVG(EXTRACT(DAY FROM COALESCE(closed_at, CURRENT_TIMESTAMP) - created_at))::INT as avg_resolution_time,
        COALESCE(SUM(claim_amount), 0) as total_claim_amount
      FROM cases
      WHERE (lawyer_id = $1 OR client_id = $1) ${dateFilter.where}
    `;

    const params = [userId];
    if (fromDate) params.push(fromDate);
    if (toDate) params.push(toDate);

    const summaryResult = await this.db.query<any>(caseSummaryQuery, params);
    const summary = summaryResult.rows[0];

    // Calculate win rate from ai_analysis_results
    const winRateQuery = `
      SELECT
        AVG(CAST(win_probability as NUMERIC) / 100)::NUMERIC(3,2) as win_rate
      FROM ai_analysis_results
      WHERE user_id = $1 AND analysis_type = 'outcome_prediction'
    `;

    const winRateResult = await this.db.query<{ win_rate: number }>(winRateQuery, [userId]);
    const winRate = winRateResult.rows[0]?.win_rate || 0;

    // Get cases by type
    const caseTypeQuery = `
      SELECT case_type as type, COUNT(*) as count
      FROM cases
      WHERE (lawyer_id = $1 OR client_id = $1)
      GROUP BY case_type
      ORDER BY count DESC
    `;

    const caseTypeResult = await this.db.query<{ type: string; count: number }>(caseTypeQuery, [
      userId,
    ]);

    // Get monthly trend
    const trendQuery = `
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as cases,
        COUNT(*) FILTER (WHERE status = 'closed') as wins
      FROM cases
      WHERE (lawyer_id = $1 OR client_id = $1)
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `;

    const trendResult = await this.db.query<{ month: string; cases: number; wins: number }>(
      trendQuery,
      [userId]
    );

    return {
      totalCases: summary.total_cases,
      openCases: summary.open_cases,
      closedCases: summary.closed_cases,
      winRate: Number(winRate),
      averageResolutionTime: summary.avg_resolution_time || 0,
      totalClaimAmount: Number(summary.total_claim_amount),
      recoveredAmount: 0, // Would require more complex logic
      casesByType: caseTypeResult.rows,
      casesByStatus: [
        { status: 'open', count: summary.open_cases },
        { status: 'closed', count: summary.closed_cases },
      ],
      monthlyTrend: trendResult.rows.reverse(),
    };
  }

  /**
   * Generate financial analytics report
   */
  async generateFinancialAnalytics(userId: string, fromDate?: Date, toDate?: Date): Promise<FinancialAnalyticsData> {
    const dateFilter = this.buildDateFilter(fromDate, toDate);

    // Get invoice totals
    const invoiceQuery = `
      SELECT
        COALESCE(SUM(total), 0) as total_billed,
        COALESCE(SUM(total) FILTER (WHERE status = 'PAID'), 0) as total_collected
      FROM invoices
      WHERE client_id = $1 ${dateFilter.where}
    `;

    const params = [userId];
    if (fromDate) params.push(fromDate);
    if (toDate) params.push(toDate);

    const invoiceResult = await this.db.query<{ total_billed: number; total_collected: number }>(
      invoiceQuery,
      params
    );
    const invoice = invoiceResult.rows[0];

    const totalBilled = Number(invoice.total_billed);
    const totalCollected = Number(invoice.total_collected);
    const outstandingAmount = totalBilled - totalCollected;
    const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

    // Get top clients
    const clientQuery = `
      SELECT
        u.id as client_id,
        u.name,
        COALESCE(SUM(i.total), 0) as amount,
        COUNT(DISTINCT c.id) as case_count
      FROM invoices i
      JOIN users u ON i.client_id = u.id
      JOIN cases c ON i.case_id = c.id
      WHERE i.client_id = $1
      GROUP BY u.id, u.name
      ORDER BY amount DESC
      LIMIT 5
    `;

    const clientResult = await this.db.query<{
      client_id: string;
      amount: number;
      case_count: number;
    }>(clientQuery, [userId]);

    // Get monthly revenue
    const monthlyQuery = `
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COALESCE(SUM(total), 0) as amount
      FROM invoices
      WHERE client_id = $1
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `;

    const monthlyResult = await this.db.query<{ month: string; amount: number }>(monthlyQuery, [
      userId,
    ]);

    // Get billable hours breakdown
    const hoursQuery = `
      SELECT
        task_type as type,
        COUNT(*) as entries,
        COALESCE(SUM(duration_minutes) / 60.0, 0)::NUMERIC(10,2) as hours,
        COALESCE(SUM(
          duration_minutes / 60.0 * hourly_rate
        ), 0)::NUMERIC(15,2) as amount
      FROM time_entries
      WHERE lawyer_id = $1 AND billable = TRUE
      GROUP BY task_type
      ORDER BY hours DESC
    `;

    const hoursResult = await this.db.query<{
      type: string;
      hours: number;
      amount: number;
    }>(hoursQuery, [userId]);

    return {
      totalBilled,
      totalCollected,
      outstandingAmount,
      collectionRate: Math.round(collectionRate),
      averageBillPerCase: 0, // Would require case count
      topClients: clientResult.rows.map(row => ({
        clientId: row.client_id,
        amount: Number(row.amount),
        caseCount: row.case_count,
      })),
      monthlyRevenue: monthlyResult.rows
        .reverse()
        .map(row => ({ month: row.month, amount: Number(row.amount) })),
      billableHours: hoursResult.rows.map(row => ({
        type: row.type,
        hours: Number(row.hours),
        amount: Number(row.amount),
      })),
      invoicingTrend: {
        invoicesSent: 0,
        invoicesPaid: 0,
        avgPaymentDays: 0,
      },
    };
  }

  /**
   * Generate performance metrics
   */
  async generatePerformanceMetrics(lawyerId: string, fromDate: Date, toDate: Date): Promise<PerformanceMetrics> {
    // Get cases handled
    const casesQuery = `
      SELECT
        COUNT(*) as cases_handled,
        COUNT(*) FILTER (WHERE status = 'closed') as cases_closed,
        AVG(EXTRACT(DAY FROM COALESCE(closed_at, CURRENT_TIMESTAMP) - created_at))::INT as avg_time
      FROM cases
      WHERE lawyer_id = $1 AND created_at >= $2 AND created_at <= $3
    `;

    const casesResult = await this.db.query<{
      cases_handled: number;
      cases_closed: number;
      avg_time: number;
    }>(casesQuery, [lawyerId, fromDate, toDate]);

    const cases = casesResult.rows[0];

    // Get billable hours
    const hoursQuery = `
      SELECT COALESCE(SUM(duration_minutes) / 60.0, 0)::NUMERIC(10,2) as billable_hours
      FROM time_entries
      WHERE lawyer_id = $1 AND billable = TRUE AND created_at >= $2 AND created_at <= $3
    `;

    const hoursResult = await this.db.query<{ billable_hours: number }>(hoursQuery, [
      lawyerId,
      fromDate,
      toDate,
    ]);

    const billableHours = Number(hoursResult.rows[0]?.billable_hours || 0);

    return {
      lawyerId,
      periodFrom: fromDate,
      periodTo: toDate,
      casesHandled: cases?.cases_handled || 0,
      winRate: 0.75, // Would need more complex calculation
      averageTimeToResolution: cases?.avg_time || 0,
      billableHours,
      clientSatisfaction: 4.5, // Would need feedback data
      specializations: ['contrato', 'tributário'],
      caseSuccess: [
        { caseType: 'contrato', successRate: 0.85 },
        { caseType: 'tributário', successRate: 0.72 },
      ],
      productivity: [],
    };
  }

  /**
   * Generate case timeline
   */
  async generateCaseTimeline(caseId: string): Promise<TimelineData> {
    // Get case updates
    const updatesQuery = `
      SELECT
        timestamp as date,
        description as title,
        type,
        actor
      FROM case_updates
      WHERE case_id = $1
      ORDER BY timestamp ASC
    `;

    const updatesResult = await this.db.query<any>(updatesQuery, [caseId]);

    return {
      caseId,
      events: updatesResult.rows.map(row => ({
        date: row.date,
        title: row.title,
        description: row.title,
        type: row.type,
        actor: row.actor,
      })),
      milestones: [],
      estimatedResolution: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Create report
   */
  async createReport(
    userId: string,
    name: string,
    type: ReportType,
    format: ReportFormat,
    data: Record<string, any>
  ): Promise<Report> {
    const query = `
      INSERT INTO reports (user_id, name, type, format, data, generated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const result = await this.db.query<Report>(query, [
      userId,
      name,
      type,
      format,
      JSON.stringify(data),
    ]);

    return result.rows[0];
  }

  /**
   * Get user reports
   */
  async getUserReports(userId: string, limit: number = 50): Promise<Report[]> {
    const query = `
      SELECT * FROM reports
      WHERE user_id = $1
      ORDER BY generated_at DESC
      LIMIT $2
    `;

    const result = await this.db.query<Report>(query, [userId, limit]);

    return result.rows;
  }

  /**
   * Create dashboard
   */
  async createDashboard(
    userId: string,
    name: string,
    widgets: DashboardWidget[]
  ): Promise<Dashboard> {
    const query = `
      INSERT INTO dashboards (user_id, name, widgets, is_public)
      VALUES ($1, $2, $3, FALSE)
      RETURNING *
    `;

    const result = await this.db.query<Dashboard>(query, [
      userId,
      name,
      JSON.stringify(widgets),
    ]);

    return result.rows[0];
  }

  /**
   * Get user dashboards
   */
  async getUserDashboards(userId: string): Promise<Dashboard[]> {
    const query = `
      SELECT * FROM dashboards
      WHERE user_id = $1 OR is_public = TRUE
      ORDER BY created_at DESC
    `;

    const result = await this.db.query<Dashboard>(query, [userId]);

    return result.rows;
  }

  /**
   * Generate metric card data
   */
  generateMetricCard(title: string, value: number | string, unit?: string, trend?: number): MetricCard {
    return {
      id: `metric-${Date.now()}`,
      title,
      value,
      unit,
      trend,
      trendDirection: trend ? (trend > 0 ? 'up' : 'down') : 'neutral',
      color: trend && trend > 0 ? '#10b981' : '#ef4444',
    };
  }

  /**
   * Generate chart data
   */
  generateChartData(title: string, type: string, data: any[]): ChartData {
    return {
      title,
      type: type as any,
      data,
    };
  }

  // Private helper methods

  private buildDateFilter(fromDate?: Date, toDate?: Date): { where: string } {
    let where = '';

    if (fromDate && toDate) {
      where = ` AND created_at >= $${2} AND created_at <= $${3}`;
    } else if (fromDate) {
      where = ` AND created_at >= $${2}`;
    } else if (toDate) {
      where = ` AND created_at <= $${2}`;
    }

    return { where };
  }
}
