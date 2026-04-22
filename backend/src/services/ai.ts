import type { Deployment, Project } from "@platform/utils";

import { getBackendConfig } from "../config.js";

interface AIInsightInput {
  project: Pick<Project, "name" | "repoOwner" | "repoName" | "branch" | "slug">;
  deployments: Deployment[];
  recentLogs: string[];
}

interface AIInsightResult {
  source: "gemini" | "rule-based";
  summary: string;
  recommendations: string[];
}

function fallbackInsight(input: AIInsightInput): AIInsightResult {
  const failureCount = input.deployments.filter(
    (deployment) => deployment.status === "failed"
  ).length;

  const latestStatus = input.deployments[0]?.status ?? "unknown";
  const recommendations: string[] = [
    "Keep deployment logs below 500 lines in dashboard for faster troubleshooting.",
    "Pin your Node version in package.json engines to avoid runtime drift.",
    "Enable health endpoint checks in app startup to reduce false success signals."
  ];

  if (failureCount > 0) {
    recommendations.unshift(
      "Investigate latest failed deployments and compare environment variables with previous successful releases."
    );
  }

  return {
    source: "rule-based",
    summary: `Latest deployment status is ${latestStatus}. Total recent failures: ${failureCount}. AI key is not configured, so this is a local rules-based summary.`,
    recommendations
  };
}

function cleanGeminiResponse(raw: string): string {
  return raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

export async function generateProjectAIInsights(
  input: AIInsightInput
): Promise<AIInsightResult> {
  const config = getBackendConfig();

  if (!config.GEMINI_API_KEY) {
    return fallbackInsight(input);
  }

  const prompt = [
    "You are a senior DevOps SRE analyst.",
    "Analyze this project deployment telemetry and return concise actionable insights.",
    "Return STRICT JSON with this exact shape:",
    '{"summary":"string","recommendations":["string","string","string"]}',
    "Keep recommendations short and implementation-focused.",
    "Project context:",
    JSON.stringify(
      {
        project: input.project,
        deployments: input.deployments.slice(0, 20),
        recentLogs: input.recentLogs.slice(-100)
      },
      null,
      2
    )
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      config.GEMINI_MODEL
    )}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 600
        }
      })
    }
  );

  if (!response.ok) {
    return fallbackInsight(input);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const generatedText =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .trim() ?? "";

  if (!generatedText) {
    return fallbackInsight(input);
  }

  try {
    const parsed = JSON.parse(cleanGeminiResponse(generatedText)) as {
      summary?: string;
      recommendations?: string[];
    };

    if (!parsed.summary || !Array.isArray(parsed.recommendations)) {
      return fallbackInsight(input);
    }

    return {
      source: "gemini",
      summary: parsed.summary,
      recommendations: parsed.recommendations.slice(0, 5)
    };
  } catch {
    return {
      source: "gemini",
      summary: generatedText,
      recommendations: []
    };
  }
}
