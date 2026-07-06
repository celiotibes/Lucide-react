import { createGeminiClient } from "../services/gemini-ai.js";
import { query } from "../db.js";

interface AiTaskInput {
  inquiryId?: string;
  bookingId?: string;
  propertyId?: string;
  message?: string;
  propertyName?: string;
  hostName?: string;
  estimatedCost?: number;
}

async function processInquiryTask(
  taskId: string,
  input: AiTaskInput
): Promise<void> {
  const client = createGeminiClient();

  try {
    const { inquiryId, message, propertyName, hostName } = input;

    if (!inquiryId || !message) {
      throw new Error("Missing required fields: inquiryId, message");
    }

    console.log(`[AI] Processing inquiry categorization for task ${taskId}`);

    // Step 1: Categorize inquiry
    const category = await client.categorizeInquiry(message);

    // Step 2: Generate reply
    const reply = await client.generateReply(
      message,
      propertyName || "our property",
      hostName || "our team"
    );

    // Step 3: Store results
    const output = JSON.stringify({
      category: category.category,
      confidence: category.confidence,
      reasoning: category.reasoning,
      reply: {
        subject: reply.subject,
        body: reply.body,
        tone: reply.tone,
      },
      processedAt: new Date().toISOString(),
    });

    await query(
      `UPDATE ai_tasks SET status = 'completed', output = $1, updated_at = NOW()
       WHERE id = $2`,
      [output, taskId]
    );

    // Update inquiry with generated reply
    if (inquiryId) {
      await query(
        `UPDATE inquiries SET response = $1, status = 'replied', updated_at = NOW()
         WHERE id = $2`,
        [reply.body, inquiryId]
      );
    }

    console.log(`✓ Completed inquiry task ${taskId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await query(
      `UPDATE ai_tasks SET status = 'failed', error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [errorMsg, taskId]
    );
    console.error(`✗ Failed inquiry task ${taskId}:`, errorMsg);
  }
}

async function processDamageAnalysisTask(
  taskId: string,
  input: AiTaskInput
): Promise<void> {
  const client = createGeminiClient();

  try {
    const { bookingId, message, estimatedCost } = input;

    if (!bookingId || !message) {
      throw new Error("Missing required fields: bookingId, message");
    }

    console.log(`[AI] Processing damage analysis for task ${taskId}`);

    const analysis = await client.analyzeDamageReport(message, estimatedCost);

    const output = JSON.stringify({
      severity: analysis.damageSeverity,
      estimatedCost: analysis.estimatedCost,
      description: analysis.description,
      recommendedAction: analysis.recommendedAction,
      processedAt: new Date().toISOString(),
    });

    await query(
      `UPDATE ai_tasks SET status = 'completed', output = $1, updated_at = NOW()
       WHERE id = $2`,
      [output, taskId]
    );

    console.log(`✓ Completed damage analysis task ${taskId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await query(
      `UPDATE ai_tasks SET status = 'failed', error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [errorMsg, taskId]
    );
    console.error(`✗ Failed damage analysis task ${taskId}:`, errorMsg);
  }
}

async function processCheckinMessageTask(
  taskId: string,
  input: AiTaskInput
): Promise<void> {
  const client = createGeminiClient();

  try {
    const { propertyId, propertyName } = input;

    if (!propertyId || !propertyName) {
      throw new Error("Missing required fields: propertyId, propertyName");
    }

    console.log(`[AI] Generating check-in message for task ${taskId}`);

    const message = await client.generateCheckinMessage(propertyName);

    const output = JSON.stringify({
      message,
      type: "checkin",
      processedAt: new Date().toISOString(),
    });

    await query(
      `UPDATE ai_tasks SET status = 'completed', output = $1, updated_at = NOW()
       WHERE id = $2`,
      [output, taskId]
    );

    console.log(`✓ Generated check-in message for task ${taskId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await query(
      `UPDATE ai_tasks SET status = 'failed', error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [errorMsg, taskId]
    );
    console.error(`✗ Failed check-in message task ${taskId}:`, errorMsg);
  }
}

async function processCheckoutMessageTask(
  taskId: string,
  input: AiTaskInput
): Promise<void> {
  const client = createGeminiClient();

  try {
    const { propertyId, propertyName } = input;

    if (!propertyId || !propertyName) {
      throw new Error("Missing required fields: propertyId, propertyName");
    }

    console.log(`[AI] Generating check-out message for task ${taskId}`);

    const message = await client.generateCheckoutMessage(propertyName);

    const output = JSON.stringify({
      message,
      type: "checkout",
      processedAt: new Date().toISOString(),
    });

    await query(
      `UPDATE ai_tasks SET status = 'completed', output = $1, updated_at = NOW()
       WHERE id = $2`,
      [output, taskId]
    );

    console.log(`✓ Generated check-out message for task ${taskId}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await query(
      `UPDATE ai_tasks SET status = 'failed', error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [errorMsg, taskId]
    );
    console.error(`✗ Failed check-out message task ${taskId}:`, errorMsg);
  }
}

async function processAiTasks(): Promise<void> {
  console.log("[AI] Processing pending AI tasks...");

  const result = await query(
    `SELECT id, task_type, input, property_id FROM ai_tasks
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 10`
  );

  const tasks = result.rows;

  if (tasks.length === 0) {
    console.log("[AI] No pending tasks");
    return;
  }

  for (const task of tasks) {
    const input = JSON.parse(task.input || "{}") as AiTaskInput;

    switch (task.task_type) {
      case "categorize_inquiry":
        await processInquiryTask(task.id, input);
        break;
      case "analyze_damage":
        await processDamageAnalysisTask(task.id, input);
        break;
      case "generate_checkin":
        await processCheckinMessageTask(task.id, input);
        break;
      case "generate_checkout":
        await processCheckoutMessageTask(task.id, input);
        break;
      default:
        console.warn(`Unknown task type: ${task.task_type}`);
    }

    // Rate limiting: 1 request per second to stay within free tier
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`[AI] Processed ${tasks.length} tasks`);
}

processAiTasks().catch((error) => {
  console.error("[AI] Fatal error:", error);
  process.exit(1);
});
