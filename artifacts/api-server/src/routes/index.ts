@@
 import smackboardRouter from "./smackboard";
 import adminRouter from "./admin";
+import oddsRouter from "./odds";
@@
 router.use(smackboardRouter);
 router.use(adminRouter);
+router.use(oddsRouter);
 
 export default router;
