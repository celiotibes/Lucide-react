import { Router, Request, Response } from "express";
import { query } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// Apply auth to all routes
router.use(authMiddleware);

// Create inquiry and trigger AI categorization
router.post("/inquiries/analyze", async (req: Request, res: Response) => {
  try {
    const { propertyId, guestName, guestEmail, message } = req.body;

    if (!propertyId || !message) {
      res.status(400).json({ error: "propertyId and message required" });
      return;
    }

    // Verify user owns the property
    const property = await query(
      "SELECT id FROM properties WHERE id = $1 AND user_id = $2",
      [propertyId, req.userId]
    );

    if (property.rows.length === 0) {
      res.status(403).json({ error: "Property not found" });
      return;
    }

    // Create inquiry
    const inquiryResult = await query(
      `INSERT INTO inquiries (property_id, guest_name, guest_email, message, source, status)
       VALUES ($1, $2, $3, $4, 'api', 'new')
       RETURNING id`,
      [propertyId, guestName || "Guest", guestEmail || "", message]
    );

    const inquiryId = inquiryResult.rows[0].id;

    // Get property name for AI context
    const propName = await query(
      "SELECT name FROM properties WHERE id = $1",
      [propertyId]
    );

    // Create AI task for categorization
    const taskId = uuidv4();
    const taskInput = JSON.stringify({
      inquiryId,
      message,
      propertyName: propName.rows[0].name,
      hostName: "Property Host",
    });

    await query(
      `INSERT INTO ai_tasks (id, property_id, inquiry_id, task_type, input, status)
       VALUES ($1, $2, $3, 'categorize_inquiry', $4, 'pending')`,
      [taskId, propertyId, inquiryId, taskInput]
    );

    res.status(201).json({
      inquiryId,
      taskId,
      status: "pending",
      message: "Inquiry received and sent for analysis",
    });
  } catch (error) {
    console.error("Inquiry analysis error:", error);
    res.status(500).json({ error: "Failed to analyze inquiry" });
  }
});

// Get inquiry with AI analysis results
router.get("/inquiries/:inquiryId", async (req: Request, res: Response) => {
  try {
    const { inquiryId } = req.params;

    const inquiry = await query(
      `SELECT i.*, p.user_id FROM inquiries i
       JOIN properties p ON i.property_id = p.id
       WHERE i.id = $1`,
      [inquiryId]
    );

    if (inquiry.rows.length === 0) {
      res.status(404).json({ error: "Inquiry not found" });
      return;
    }

    if (inquiry.rows[0].user_id !== req.userId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    // Get AI task results
    const task = await query(
      "SELECT * FROM ai_tasks WHERE inquiry_id = $1 ORDER BY created_at DESC LIMIT 1",
      [inquiryId]
    );

    res.json({
      inquiry: inquiry.rows[0],
      aiAnalysis: task.rows.length > 0 ? JSON.parse(task.rows[0].output || "{}") : null,
      taskStatus: task.rows.length > 0 ? task.rows[0].status : null,
    });
  } catch (error) {
    console.error("Get inquiry error:", error);
    res.status(500).json({ error: "Failed to fetch inquiry" });
  }
});

// Analyze damage report
router.post("/damage/analyze", async (req: Request, res: Response) => {
  try {
    const { propertyId, bookingId, description, estimatedCost } = req.body;

    if (!propertyId || !description) {
      res.status(400).json({ error: "propertyId and description required" });
      return;
    }

    // Verify user owns the property
    const property = await query(
      "SELECT id FROM properties WHERE id = $1 AND user_id = $2",
      [propertyId, req.userId]
    );

    if (property.rows.length === 0) {
      res.status(403).json({ error: "Property not found" });
      return;
    }

    // Create AI task for damage analysis
    const taskId = uuidv4();
    const taskInput = JSON.stringify({
      bookingId: bookingId || propertyId,
      message: description,
      estimatedCost: estimatedCost || 0,
    });

    await query(
      `INSERT INTO ai_tasks (id, property_id, booking_id, task_type, input, status)
       VALUES ($1, $2, $3, 'analyze_damage', $4, 'pending')`,
      [
        taskId,
        propertyId,
        bookingId || null,
        taskInput,
      ]
    );

    res.status(201).json({
      taskId,
      status: "pending",
      message: "Damage report submitted for analysis",
    });
  } catch (error) {
    console.error("Damage analysis error:", error);
    res.status(500).json({ error: "Failed to analyze damage" });
  }
});

// Get AI task status and results
router.get("/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    const task = await query(
      `SELECT t.*, p.user_id FROM ai_tasks t
       JOIN properties p ON t.property_id = p.id
       WHERE t.id = $1`,
      [taskId]
    );

    if (task.rows.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (task.rows[0].user_id !== req.userId) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const taskData = task.rows[0];

    res.json({
      taskId: taskData.id,
      type: taskData.task_type,
      status: taskData.status,
      output: taskData.output ? JSON.parse(taskData.output) : null,
      error: taskData.error_message,
      createdAt: taskData.created_at,
      updatedAt: taskData.updated_at,
    });
  } catch (error) {
    console.error("Get task error:", error);
    res.status(500).json({ error: "Failed to fetch task" });
  }
});

// List tasks for property
router.get("/properties/:propertyId/tasks", async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;

    const property = await query(
      "SELECT id FROM properties WHERE id = $1 AND user_id = $2",
      [propertyId, req.userId]
    );

    if (property.rows.length === 0) {
      res.status(403).json({ error: "Property not found" });
      return;
    }

    const tasks = await query(
      `SELECT id, task_type, status, created_at, updated_at
       FROM ai_tasks
       WHERE property_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [propertyId]
    );

    res.json(tasks.rows);
  } catch (error) {
    console.error("List tasks error:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

export default router;
