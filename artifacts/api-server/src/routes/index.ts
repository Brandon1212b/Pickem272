diff --git a/artifacts/api-server/src/routes/index.ts b/artifacts/api-server/src/routes/index.ts
index de5299e..0000000 100644
--- a/artifacts/api-server/src/routes/index.ts
+++ b/artifacts/api-server/src/routes/index.ts
@@
 import smackboardRouter from "./smackboard";
 import adminRouter from "./admin";
+import oddsRouter from "./odds";
@@
 router.use(smackboardRouter);
 router.use(adminRouter);
+router.use(oddsRouter);
 
 export default router;
