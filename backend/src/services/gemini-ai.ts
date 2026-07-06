import axios, { AxiosInstance } from "axios";

interface GeminiRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

interface CategoryResult {
  category: string;
  confidence: number;
  reasoning: string;
}

interface GeneratedReply {
  subject: string;
  body: string;
  tone: string;
}

interface DamageAnalysis {
  damageSeverity: "none" | "minor" | "moderate" | "severe";
  estimatedCost: number;
  description: string;
  recommendedAction: string;
}

class GeminiAiClient {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  private freeQuotaExceeded = false;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";

    this.client = axios.create({
      timeout: 30000,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 429) {
          console.warn("[Gemini] Rate limit exceeded - switching to fallback");
          this.freeQuotaExceeded = true;
        }
        throw error;
      }
    );
  }

  private async callGemini(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const request: GeminiRequest = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    };

    try {
      const response = await this.client.post<GeminiResponse>(
        this.baseUrl,
        request,
        {
          params: {
            key: this.apiKey,
          },
        }
      );

      if (
        response.data.candidates &&
        response.data.candidates.length > 0 &&
        response.data.candidates[0].content.parts.length > 0
      ) {
        return response.data.candidates[0].content.parts[0].text;
      }

      throw new Error("Empty response from Gemini");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        this.freeQuotaExceeded = true;
      }
      throw error;
    }
  }

  async categorizeInquiry(inquiry: string): Promise<CategoryResult> {
    const prompt = `Analyze this guest inquiry and categorize it into one of: amenity_question, price_inquiry, booking_modification, damage_report, complaint, or other.

Inquiry: "${inquiry}"

Respond in JSON format:
{
  "category": "category_name",
  "confidence": 0.95,
  "reasoning": "brief explanation"
}`;

    try {
      const response = await this.callGemini(prompt);
      const parsed = JSON.parse(response);
      return {
        category: parsed.category || "other",
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || "",
      };
    } catch (error) {
      console.error("[Gemini] Categorization failed:", error);
      return {
        category: "other",
        confidence: 0,
        reasoning: "Failed to categorize",
      };
    }
  }

  async generateReply(
    inquiry: string,
    propertyName: string,
    hostName: string
  ): Promise<GeneratedReply> {
    const prompt = `Generate a professional and friendly reply to this guest inquiry about a vacation rental.

Property: ${propertyName}
Host: ${hostName}
Guest Inquiry: "${inquiry}"

Generate a response in this JSON format:
{
  "subject": "Reply subject line",
  "body": "Full response body - professional but warm tone",
  "tone": "friendly|formal|casual"
}`;

    try {
      const response = await this.callGemini(prompt);
      const parsed = JSON.parse(response);
      return {
        subject: parsed.subject || "Response to Your Inquiry",
        body: parsed.body || "Thank you for reaching out.",
        tone: parsed.tone || "friendly",
      };
    } catch (error) {
      console.error("[Gemini] Reply generation failed:", error);
      return {
        subject: "Response to Your Inquiry",
        body: "Thank you for reaching out. We appreciate your interest and will respond shortly.",
        tone: "friendly",
      };
    }
  }

  async analyzeDamageReport(
    description: string,
    estimatedCost?: number
  ): Promise<DamageAnalysis> {
    const costHint = estimatedCost ? ` (estimated cost: $${estimatedCost})` : "";
    const prompt = `Analyze this damage report for a vacation rental and assess severity.

Damage Description: "${description}"${costHint}

Respond in JSON format:
{
  "damageSeverity": "none|minor|moderate|severe",
  "estimatedCost": 150,
  "description": "What happened in detail",
  "recommendedAction": "repair|replacement|professional_assessment"
}`;

    try {
      const response = await this.callGemini(prompt);
      const parsed = JSON.parse(response);
      return {
        damageSeverity: parsed.damageSeverity || "minor",
        estimatedCost: parsed.estimatedCost || 0,
        description: parsed.description || description,
        recommendedAction: parsed.recommendedAction || "repair",
      };
    } catch (error) {
      console.error("[Gemini] Damage analysis failed:", error);
      return {
        damageSeverity: "minor",
        estimatedCost: 0,
        description: description,
        recommendedAction: "professional_assessment",
      };
    }
  }

  async generateCheckoutMessage(propertyName: string): Promise<string> {
    const prompt = `Generate a warm and professional checkout message for guests leaving a vacation rental.

Property: ${propertyName}

The message should:
- Thank them for staying
- Remind them about checkout procedures
- Ask them to leave feedback
- Provide emergency contact info placeholder
- Be 150-200 words

Generate only the message text, no JSON.`;

    try {
      return await this.callGemini(prompt);
    } catch (error) {
      console.error("[Gemini] Checkout message generation failed:", error);
      return `Thank you for staying at ${propertyName}! We hope you enjoyed your time with us. Please ensure checkout is completed by 11:00 AM. If you have any questions, please don't hesitate to contact us.`;
    }
  }

  async generateCheckinMessage(propertyName: string): Promise<string> {
    const prompt = `Generate a warm welcome message for guests arriving at a vacation rental.

Property: ${propertyName}

The message should:
- Welcome them warmly
- Provide check-in instructions
- Highlight key property features
- Include WiFi/parking info placeholder
- Be 150-200 words

Generate only the message text, no JSON.`;

    try {
      return await this.callGemini(prompt);
    } catch (error) {
      console.error("[Gemini] Check-in message generation failed:", error);
      return `Welcome to ${propertyName}! We're excited to have you stay with us. Your check-in code will be sent via text/email shortly. If you need any assistance, please reach out immediately.`;
    }
  }

  isQuotaExceeded(): boolean {
    return this.freeQuotaExceeded;
  }

  resetQuotaStatus(): void {
    this.freeQuotaExceeded = false;
  }
}

export function createGeminiClient(): GeminiAiClient {
  return new GeminiAiClient();
}

export { GeminiAiClient };
