import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { buildDecisionIntelligencePayload } from "../services/decisionIntelligenceService";

/**
 * Controller to retrieve HireIQ Decision Intelligence for a candidate
 * GET /api/candidates/:candidateId/decision-intelligence
 * GET /api/jobs/:jobId/candidates/:candidateId/decision-intelligence
 */
export const getCandidateDecisionIntelligenceController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user.userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const candidateId = String(
      req.params.candidateId || req.query.candidateId || "",
    ).trim();
    const jobId =
      String(req.params.jobId || req.query.jobId || "").trim() || undefined;

    if (!candidateId) {
      res.status(400).json({ error: "Candidate ID is required" });
      return;
    }

    const orgId = user.organizationId || "org-tasknera";
    const isSuperAdmin =
      user.role === "SUPER_ADMIN" ||
      user.role === "CLIENT_ADMIN" ||
      user.email === "operations@tasknera.com" ||
      user.email === "demo@gmail.com";

    const payload = await buildDecisionIntelligencePayload(
      candidateId,
      jobId,
      orgId,
      isSuperAdmin,
    );

    if (!payload) {
      res.status(404).json({
        error:
          "Candidate decision intelligence not found or access is unauthorized for this organization.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (error: any) {
    console.error("[HireIQ Decision Intelligence Error]:", error);
    res.status(500).json({
      error:
        "An internal error occurred while generating decision intelligence.",
      details: error?.message || "Unknown error",
    });
  }
};
