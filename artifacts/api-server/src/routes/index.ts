import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import matchesRouter from "./matches";
import picksRouter from "./picks";
import leaderboardRouter from "./leaderboard";
import smackboardRouter from "./smackboard";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(matchesRouter);
router.use(picksRouter);
router.use(leaderboardRouter);
router.use(smackboardRouter);
router.use(adminRouter);

export default router;
