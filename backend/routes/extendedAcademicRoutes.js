import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createAcademicRule, listAcademicRules, deactivateAcademicRule, simulateAcademicPerformance,
  createAcademicApplication, listAcademicApplications, transitionAcademicApplication,
  listPortfolio, createPortfolioItem, updatePortfolioItem, deletePortfolioItem, verifyPortfolioItem,
  createTopicAssessment, listTopicAnalysis,
  createOpportunity, listBacklogs, listOpportunities, interactOpportunity, removeOpportunityBookmark, publishOpportunity, updateOpportunity, deleteOpportunity,
} from "../controllers/extendedAcademicController.js";
const router = express.Router();
router.use(protect);
router.get("/rules", listAcademicRules);
router.post("/rules", createAcademicRule);
router.patch("/rules/:id/deactivate", deactivateAcademicRule);
router.post("/simulator", simulateAcademicPerformance);
router.get("/backlogs", listBacklogs);
router.get("/applications", listAcademicApplications);
router.post("/applications", createAcademicApplication);
router.patch("/applications/:id/status", transitionAcademicApplication);
router.get("/portfolio", listPortfolio);
router.get("/portfolio/:studentId", listPortfolio);
router.post("/portfolio", createPortfolioItem);
router.patch("/portfolio/:id", updatePortfolioItem);
router.delete("/portfolio/:id", deletePortfolioItem);
router.patch("/portfolio/:id/verification", verifyPortfolioItem);
router.get("/topics", listTopicAnalysis);
router.post("/topics", createTopicAssessment);
router.get("/opportunities", listOpportunities);
router.post("/opportunities", createOpportunity);
router.patch("/opportunities/:id", updateOpportunity);
router.delete("/opportunities/:id", deleteOpportunity);
router.patch("/opportunities/:id/status", publishOpportunity);
router.post("/opportunities/:id/interactions", interactOpportunity);
router.delete("/opportunities/:id/bookmark", removeOpportunityBookmark);
export default router;
