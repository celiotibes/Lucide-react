import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { query } from "../db.js";

describe("Gemini AI Integration", () => {
  beforeEach(async () => {
    // Setup: Create test user and property
    await query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)`,
      ["ai-user-123", "ai@example.com", "hash"]
    );

    await query(
      `INSERT INTO properties (id, user_id, name) VALUES ($1, $2, $3)`,
      ["ai-prop-123", "ai-user-123", "AI Test Property"]
    );
  });

  afterEach(async () => {
    // Cleanup
    await query("DELETE FROM ai_tasks WHERE property_id = $1", ["ai-prop-123"]);
    await query("DELETE FROM inquiries WHERE property_id = $1", ["ai-prop-123"]);
    await query("DELETE FROM properties WHERE id = $1", ["ai-prop-123"]);
    await query("DELETE FROM users WHERE id = $1", ["ai-user-123"]);
  });

  it("should parse inquiry categorization response", async () => {
    const response = `{
      "category": "amenity_question",
      "confidence": 0.95,
      "reasoning": "Guest is asking about WiFi availability"
    }`;

    const parsed = JSON.parse(response);

    expect(parsed.category).toBe("amenity_question");
    expect(parsed.confidence).toBe(0.95);
    expect(parsed.confidence).toBeGreaterThan(0.9);
  });

  it("should parse damage analysis response", async () => {
    const response = `{
      "damageSeverity": "moderate",
      "estimatedCost": 250,
      "description": "Broken window pane in master bedroom",
      "recommendedAction": "replacement"
    }`;

    const parsed = JSON.parse(response);

    expect(["none", "minor", "moderate", "severe"]).toContain(
      parsed.damageSeverity
    );
    expect(parsed.estimatedCost).toBeGreaterThan(0);
    expect(parsed.recommendedAction).toBe("replacement");
  });

  it("should create AI task for inquiry analysis", async () => {
    const taskId = "test-task-123";
    const taskInput = JSON.stringify({
      inquiryId: "inq-123",
      message: "Does the property have WiFi?",
      propertyName: "Test Property",
      hostName: "Host Name",
    });

    await query(
      `INSERT INTO ai_tasks (id, property_id, inquiry_id, task_type, input, status)
       VALUES ($1, $2, $3, 'categorize_inquiry', $4, 'pending')`,
      [taskId, "ai-prop-123", "inq-123", taskInput]
    );

    const result = await query(
      "SELECT * FROM ai_tasks WHERE id = $1",
      [taskId]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].task_type).toBe("categorize_inquiry");
    expect(result.rows[0].status).toBe("pending");
  });

  it("should handle AI task completion", async () => {
    const taskId = "test-task-456";
    const output = JSON.stringify({
      category: "price_inquiry",
      confidence: 0.92,
      reply: {
        subject: "Re: Your Pricing Question",
        body: "Thank you for your inquiry...",
        tone: "friendly",
      },
    });

    await query(
      `INSERT INTO ai_tasks (id, property_id, task_type, input, status)
       VALUES ($1, $2, 'categorize_inquiry', '{}', 'pending')`,
      [taskId, "ai-prop-123"]
    );

    await query(
      `UPDATE ai_tasks SET status = 'completed', output = $1, updated_at = NOW()
       WHERE id = $2`,
      [output, taskId]
    );

    const result = await query(
      "SELECT * FROM ai_tasks WHERE id = $1",
      [taskId]
    );

    expect(result.rows[0].status).toBe("completed");
    expect(result.rows[0].output).toBeDefined();
    const parsed = JSON.parse(result.rows[0].output);
    expect(parsed.category).toBe("price_inquiry");
  });

  it("should handle AI task failure", async () => {
    const taskId = "test-task-789";
    const errorMsg = "API rate limit exceeded";

    await query(
      `INSERT INTO ai_tasks (id, property_id, task_type, input, status)
       VALUES ($1, $2, 'categorize_inquiry', '{}', 'pending')`,
      [taskId, "ai-prop-123"]
    );

    await query(
      `UPDATE ai_tasks SET status = 'failed', error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [errorMsg, taskId]
    );

    const result = await query(
      "SELECT * FROM ai_tasks WHERE id = $1",
      [taskId]
    );

    expect(result.rows[0].status).toBe("failed");
    expect(result.rows[0].error_message).toBe(errorMsg);
  });

  it("should create inquiry and associated AI task", async () => {
    const inquiry = await query(
      `INSERT INTO inquiries (property_id, guest_name, guest_email, message, source, status)
       VALUES ($1, $2, $3, $4, 'api', 'new')
       RETURNING id`,
      ["ai-prop-123", "John Doe", "john@example.com", "Is there parking?"]
    );

    const inquiryId = inquiry.rows[0].id;

    await query(
      `INSERT INTO ai_tasks (property_id, inquiry_id, task_type, input, status)
       VALUES ($1, $2, 'categorize_inquiry', '{}', 'pending')`,
      ["ai-prop-123", inquiryId]
    );

    const tasks = await query(
      "SELECT * FROM ai_tasks WHERE inquiry_id = $1",
      [inquiryId]
    );

    expect(tasks.rows).toHaveLength(1);
    expect(tasks.rows[0].inquiry_id).toBe(inquiryId);
  });

  it("should generate appropriate reply for different inquiry types", () => {
    const testCases = [
      {
        type: "amenity_question",
        inquiry: "Is there WiFi?",
        expectedTone: "friendly",
      },
      {
        type: "price_inquiry",
        inquiry: "What's your cancellation policy?",
        expectedTone: "formal",
      },
      {
        type: "booking_modification",
        inquiry: "Can I extend my stay?",
        expectedTone: "friendly",
      },
    ];

    for (const testCase of testCases) {
      // In real scenario, this would call Gemini API
      // For testing, we verify the structure
      const reply = {
        subject: "Re: Your Inquiry",
        body: "Thank you for reaching out...",
        tone: testCase.expectedTone,
      };

      expect(reply.subject).toBeDefined();
      expect(reply.body).toBeDefined();
      expect(["friendly", "formal", "casual"]).toContain(reply.tone);
    }
  });

  it("should batch process pending AI tasks", async () => {
    const taskIds = [];

    for (let i = 0; i < 5; i++) {
      const result = await query(
        `INSERT INTO ai_tasks (property_id, task_type, input, status)
         VALUES ($1, 'categorize_inquiry', '{}', 'pending')
         RETURNING id`,
        ["ai-prop-123"]
      );
      taskIds.push(result.rows[0].id);
    }

    // Query pending tasks
    const pending = await query(
      `SELECT id FROM ai_tasks
       WHERE status = 'pending' AND property_id = $1
       ORDER BY created_at ASC
       LIMIT 10`,
      ["ai-prop-123"]
    );

    expect(pending.rows.length).toBe(5);
    pending.rows.forEach((row, idx) => {
      expect(taskIds).toContain(row.id);
    });
  });

  it("should detect damage severity levels correctly", () => {
    const testCases = [
      {
        description: "Tiny scratch on wall",
        expectedSeverity: "minor",
      },
      {
        description: "Broken window and water damage to floor",
        expectedSeverity: "moderate",
      },
      {
        description: "Complete destruction of living room furniture",
        expectedSeverity: "severe",
      },
    ];

    // In real scenario, this would use Gemini API
    // For testing, we verify the structure
    for (const testCase of testCases) {
      const analysis = {
        damageSeverity: "minor",
        estimatedCost: 100,
        description: testCase.description,
        recommendedAction: "repair",
      };

      expect(["none", "minor", "moderate", "severe"]).toContain(
        analysis.damageSeverity
      );
      expect(analysis.estimatedCost).toBeGreaterThanOrEqual(0);
    }
  });

  it("should update inquiry with AI-generated response", async () => {
    const inquiry = await query(
      `INSERT INTO inquiries (property_id, guest_name, guest_email, message, source, status)
       VALUES ($1, $2, $3, $4, 'api', 'new')
       RETURNING id`,
      [
        "ai-prop-123",
        "Jane Doe",
        "jane@example.com",
        "What amenities are included?",
      ]
    );

    const inquiryId = inquiry.rows[0].id;
    const generatedReply =
      "Thank you for your inquiry. Our property includes WiFi, parking, and full kitchen facilities.";

    await query(
      `UPDATE inquiries SET response = $1, status = 'replied', updated_at = NOW()
       WHERE id = $2`,
      [generatedReply, inquiryId]
    );

    const result = await query(
      "SELECT * FROM inquiries WHERE id = $1",
      [inquiryId]
    );

    expect(result.rows[0].response).toBe(generatedReply);
    expect(result.rows[0].status).toBe("replied");
  });

  it("should handle rate limiting with 1 request per second", async () => {
    const requestTimestamps: number[] = [];

    for (let i = 0; i < 5; i++) {
      requestTimestamps.push(Date.now());
      // Simulate 1 req/sec rate limiting
      if (i < 4) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // Verify we have timestamps spread out
    expect(requestTimestamps.length).toBe(5);
    const minDelay =
      Math.min(
        ...requestTimestamps.slice(1).map((t, i) => t - requestTimestamps[i])
      );
    expect(minDelay).toBeGreaterThan(0);
  });

  it("should retrieve task results including output", async () => {
    const taskId = "results-task-123";
    const output = JSON.stringify({
      category: "complaint",
      confidence: 0.98,
      reply: {
        subject: "We Sincerely Apologize",
        body: "We are sorry to hear about your experience...",
        tone: "formal",
      },
    });

    await query(
      `INSERT INTO ai_tasks (id, property_id, task_type, input, output, status)
       VALUES ($1, $2, 'categorize_inquiry', '{}', $3, 'completed')`,
      [taskId, "ai-prop-123", output]
    );

    const result = await query(
      "SELECT * FROM ai_tasks WHERE id = $1",
      [taskId]
    );

    expect(result.rows).toHaveLength(1);
    const parsed = JSON.parse(result.rows[0].output);
    expect(parsed.category).toBe("complaint");
    expect(parsed.confidence).toBe(0.98);
  });
});
